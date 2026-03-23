const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

admin.initializeApp();

const database = admin.database();
const bucket = admin.storage().bucket();

exports.generateInvoicePdf = onCall({ region: 'us-central1', cors: true }, async (request) => {
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
      cacheControl: 'public, max-age=3600'
    }
  });
  await file.makePublic();

  const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
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

  logger.info('Invoice generated', { orderId, invoiceId, pdfUrl });
  return invoiceRecord;
});

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

function createInvoiceNumber(orderId) {
  return `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${orderId.slice(-6).toUpperCase()}`;
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