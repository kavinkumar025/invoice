const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onValueCreated } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

admin.initializeApp();

const database = admin.database();
const bucket = admin.storage().bucket();
let transporter;

exports.generateInvoicePdf = onCall({ region: 'us-central1', cors: true }, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required to generate invoices.');
    }

    const orderId = request.data?.orderId;
    if (!orderId || typeof orderId !== 'string') {
      throw new HttpsError('invalid-argument', 'orderId is required.');
    }

    const orderSnapshot = await database.ref(`orders/${orderId}`).get();
    if (!orderSnapshot.exists()) {
      throw new HttpsError('not-found', 'Order not found.');
    }

    const order = orderSnapshot.val();
    const invoiceId = order.invoiceId || orderId;
    const invoiceNumber = order.invoiceNumber || createInvoiceNumber(orderId);
    const pdfBytes = await buildInvoicePdf(order, invoiceNumber);
    const filePath = `invoices/${order.sellerId}/${invoiceId}.pdf`;
    const file = bucket.file(filePath);

    await file.save(Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      resumable: false,
      metadata: {
        cacheControl: 'private, max-age=3600',
        contentDisposition: `attachment; filename="${invoiceNumber}.pdf"`
      }
    });

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      version: 'v4',
      expires: '2100-01-01'
    });

    const pdfUrl = signedUrl;
    const now = new Date().toISOString();
    const invoiceRecord = {
      id: invoiceId,
      orderId,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      invoiceNumber,
      subtotalAmount: order.subtotalAmount,
      gstAmount: order.gstAmount,
      totalAmount: order.totalAmount,
      pdfUrl,
      createdAt: now
    };

    await Promise.all([
      database.ref(`invoices/${invoiceId}`).set(invoiceRecord),
      database.ref(`orders/${orderId}`).update({
        invoiceId,
        invoiceNumber,
        invoiceUrl: pdfUrl,
        updatedAt: now
      })
    ]);

    logger.info('Invoice generated', { orderId, invoiceId, filePath });
    return invoiceRecord;
  } catch (error) {
    logger.error('Invoice generation failed', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Could not generate the invoice PDF. Check function deployment and Storage configuration.');
  }
});

exports.notifyOrderCreated = onValueCreated(
  {
    ref: '/orders/{orderId}',
    region: 'us-central1'
  },
  async (event) => {
    const orderId = event.params.orderId;
    const order = event.data.val();

    if (!order) {
      logger.warn('Skipping notification: missing order payload', { orderId });
      return;
    }

    const smtpConfigured = hasSmtpConfig();
    const sellerProfileSnapshot = await database.ref(`users/${order.sellerId}`).get();
    const sellerProfile = sellerProfileSnapshot.exists() ? sellerProfileSnapshot.val() : null;
    const notificationRef = database.ref(`orderNotifications/${orderId}`);
    const buyerWhatsAppUrl = createWhatsAppUrl(order.buyerPhone, buildBuyerWhatsAppMessage(order));
    const sellerWhatsAppUrl = createWhatsAppUrl(sellerProfile?.phone, buildSellerWhatsAppMessage(order));

    const notificationRecord = {
      orderId,
      buyerEmail: order.buyerEmail || null,
      sellerEmail: sellerProfile?.email || null,
      buyerEmailSent: false,
      sellerEmailSent: false,
      emailConfigured: smtpConfigured,
      buyerWhatsAppUrl,
      sellerWhatsAppUrl,
      whatsappAutomationNote:
        'Automated WhatsApp sending requires a provider such as Twilio WhatsApp API or Meta Cloud API with approved templates.',
      updatedAt: new Date().toISOString()
    };

    if (!smtpConfigured) {
      await notificationRef.set({
        ...notificationRecord,
        status: 'skipped',
        reason: 'SMTP configuration missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.'
      });
      logger.warn('Order notification skipped because SMTP is not configured', { orderId });
      return;
    }

    const activeTransporter = getTransporter();
    const sendTasks = [];

    if (order.buyerEmail) {
      const buyerMail = buildBuyerEmail(order);
      sendTasks.push(
        activeTransporter.sendMail({
          from: process.env.SMTP_FROM,
          to: order.buyerEmail,
          subject: buyerMail.subject,
          text: buyerMail.text,
          html: buyerMail.html
        }).then(() => ({ key: 'buyerEmailSent', success: true }))
      );
    }

    if (sellerProfile?.email) {
      const sellerMail = buildSellerEmail(order);
      sendTasks.push(
        activeTransporter.sendMail({
          from: process.env.SMTP_FROM,
          to: sellerProfile.email,
          subject: sellerMail.subject,
          text: sellerMail.text,
          html: sellerMail.html
        }).then(() => ({ key: 'sellerEmailSent', success: true }))
      );
    }

    const results = await Promise.allSettled(sendTasks);
    let failureReason = null;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        notificationRecord[result.value.key] = result.value.success;
      } else {
        failureReason = result.reason instanceof Error ? result.reason.message : 'Unknown email delivery failure.';
      }
    }

    await notificationRef.set({
      ...notificationRecord,
      status: failureReason ? 'partial-failure' : 'sent',
      reason: failureReason
    });

    logger.info('Order notifications processed', {
      orderId,
      buyerEmailSent: notificationRecord.buyerEmailSent,
      sellerEmailSent: notificationRecord.sellerEmailSent,
      failureReason
    });
  }
);

async function buildInvoicePdf(order, invoiceNumber) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  let cursorY = height - 56;

  page.drawRectangle({ x: 40, y: height - 124, width: width - 80, height: 88, color: rgb(0.12, 0.42, 0.29) });
  page.drawText('InvoiceHub B2B Invoice', { x: 56, y: height - 72, size: 22, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(`Invoice No: ${invoiceNumber}`, { x: 56, y: height - 96, size: 11, font, color: rgb(1, 1, 1) });

  cursorY = height - 158;
  drawLabelValue(page, 'Seller', order.sellerName, 40, cursorY, boldFont, font);
  drawLabelValue(page, 'Buyer', order.buyerBusinessName || order.buyerName, 300, cursorY, boldFont, font);
  cursorY -= 20;
  drawLabelValue(page, 'Buyer Email', order.buyerEmail, 300, cursorY, boldFont, font);
  cursorY -= 20;
  drawLabelValue(page, 'Payment', order.paymentType.toUpperCase(), 40, cursorY, boldFont, font);
  drawLabelValue(page, 'Status', order.status.toUpperCase(), 300, cursorY, boldFont, font);
  cursorY -= 20;
  drawLabelValue(page, 'Deliver To', formatAddress(order.shippingAddress), 40, cursorY, boldFont, font);
  cursorY -= 36;

  page.drawText('Items', { x: 40, y: cursorY, size: 14, font: boldFont, color: rgb(0.12, 0.16, 0.12) });
  cursorY -= 22;

  for (const line of order.products) {
    page.drawText(`${line.productName} x ${line.quantity} ${line.unitLabel}`, { x: 40, y: cursorY, size: 11, font });
    page.drawText(formatCurrency(line.price * line.quantity), { x: 450, y: cursorY, size: 11, font: boldFont });
    cursorY -= 18;
  }

  cursorY -= 12;
  page.drawLine({ start: { x: 40, y: cursorY }, end: { x: width - 40, y: cursorY }, thickness: 1, color: rgb(0.84, 0.84, 0.84) });
  cursorY -= 24;
  drawAmountRow(page, 'Subtotal', order.subtotalAmount, 40, 450, cursorY, boldFont, font);
  cursorY -= 18;
  drawAmountRow(page, 'GST', order.gstAmount, 40, 450, cursorY, boldFont, font);
  cursorY -= 18;
  drawAmountRow(page, 'Total', order.totalAmount, 40, 450, cursorY, boldFont, boldFont);

  return pdfDoc.save();
}

function drawLabelValue(page, label, value, x, y, boldFont, font) {
  page.drawText(`${label}:`, { x, y, size: 11, font: boldFont, color: rgb(0.12, 0.16, 0.12) });
  page.drawText(String(value || '-'), { x: x + 74, y, size: 11, font, color: rgb(0.25, 0.25, 0.25) });
}

function drawAmountRow(page, label, amount, x, amountX, y, labelFont, amountFont) {
  page.drawText(label, { x, y, size: 12, font: labelFont, color: rgb(0.12, 0.16, 0.12) });
  page.drawText(formatCurrency(amount), { x: amountX, y, size: 12, font: amountFont, color: rgb(0.12, 0.16, 0.12) });
}

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return transporter;
}

function buildBuyerEmail(order) {
  const subject = `Order ${order.id} confirmed with ${order.sellerName}`;
  const lines = formatOrderLines(order.products);
  const address = formatAddress(order.shippingAddress);
  const text = [
    `Hello ${order.buyerBusinessName || order.buyerName},`,
    '',
    `Your order ${order.id} has been placed successfully with ${order.sellerName}.`,
    '',
    'Items:',
    lines,
    '',
    `Delivery address: ${address}`,
    `Payment type: ${String(order.paymentType || '').toUpperCase()}`,
    `Total amount: ${formatCurrency(order.totalAmount)}`
  ].join('\n');
  const html = `
    <p>Hello ${escapeHtml(order.buyerBusinessName || order.buyerName)},</p>
    <p>Your order <strong>${escapeHtml(order.id)}</strong> has been placed successfully with <strong>${escapeHtml(order.sellerName)}</strong>.</p>
    <p><strong>Items</strong><br>${formatOrderLinesHtml(order.products)}</p>
    <p><strong>Delivery address:</strong> ${escapeHtml(address)}</p>
    <p><strong>Payment type:</strong> ${escapeHtml(String(order.paymentType || '').toUpperCase())}</p>
    <p><strong>Total amount:</strong> ${escapeHtml(formatCurrency(order.totalAmount))}</p>
  `;

  return { subject, text, html };
}

function buildSellerEmail(order) {
  const subject = `New order ${order.id} from ${order.buyerBusinessName || order.buyerName}`;
  const lines = formatOrderLines(order.products);
  const address = formatAddress(order.shippingAddress);
  const text = [
    `Hello ${order.sellerName},`,
    '',
    `You received a new order ${order.id}.`,
    '',
    `Buyer: ${order.buyerBusinessName || order.buyerName}`,
    `Buyer email: ${order.buyerEmail}`,
    `Buyer phone: ${order.buyerPhone || '-'}`,
    '',
    'Items:',
    lines,
    '',
    `Delivery address: ${address}`,
    `Total amount: ${formatCurrency(order.totalAmount)}`
  ].join('\n');
  const html = `
    <p>Hello ${escapeHtml(order.sellerName)},</p>
    <p>You received a new order <strong>${escapeHtml(order.id)}</strong>.</p>
    <p><strong>Buyer:</strong> ${escapeHtml(order.buyerBusinessName || order.buyerName)}<br>
    <strong>Buyer email:</strong> ${escapeHtml(order.buyerEmail)}<br>
    <strong>Buyer phone:</strong> ${escapeHtml(order.buyerPhone || '-')}</p>
    <p><strong>Items</strong><br>${formatOrderLinesHtml(order.products)}</p>
    <p><strong>Delivery address:</strong> ${escapeHtml(address)}</p>
    <p><strong>Total amount:</strong> ${escapeHtml(formatCurrency(order.totalAmount))}</p>
  `;

  return { subject, text, html };
}

function createInvoiceNumber(orderId) {
  return `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${orderId.slice(-6).toUpperCase()}`;
}

function formatOrderLines(products) {
  return (products || [])
    .map((line) => `- ${line.productName} x ${line.quantity} ${line.unitLabel} = ${formatCurrency(line.price * line.quantity)}`)
    .join('\n');
}

function formatOrderLinesHtml(products) {
  return (products || [])
    .map((line) => `${escapeHtml(line.productName)} x ${escapeHtml(String(line.quantity))} ${escapeHtml(line.unitLabel)} = ${escapeHtml(formatCurrency(line.price * line.quantity))}`)
    .join('<br>');
}

function createWhatsAppUrl(phone, message) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) {
    return null;
  }

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function buildBuyerWhatsAppMessage(order) {
  return `Your order ${order.id} with ${order.sellerName} has been placed successfully. Total ${formatCurrency(order.totalAmount)}.`;
}

function buildSellerWhatsAppMessage(order) {
  return `New order ${order.id} received from ${order.buyerBusinessName || order.buyerName}. Total ${formatCurrency(order.totalAmount)}.`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatAddress(address) {
  return [address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).join(', ');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}