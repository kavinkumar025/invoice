const admin = require('firebase-admin');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ error: 'You must be signed in to generate an invoice.' });
      return;
    }

    const app = getAdminApp();
    const decodedToken = await admin.auth(app).verifyIdToken(token);
    const orderId = req.body?.orderId;

    if (!orderId || typeof orderId !== 'string') {
      res.status(400).json({ error: 'orderId is required.' });
      return;
    }

    const database = admin.database(app);
    const bucket = admin.storage(app).bucket();
    const orderSnapshot = await database.ref(`orders/${orderId}`).get();

    if (!orderSnapshot.exists()) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const order = orderSnapshot.val();
    if (decodedToken.uid !== order.buyerId && decodedToken.uid !== order.sellerId) {
      res.status(403).json({ error: 'Unauthorized invoice request for this order.' });
      return;
    }

    if (order.invoiceUrl && order.invoiceId && order.invoiceNumber) {
      res.status(200).json({
        id: order.invoiceId,
        orderId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        invoiceNumber: order.invoiceNumber,
        subtotalAmount: order.subtotalAmount,
        gstAmount: order.gstAmount,
        totalAmount: order.totalAmount,
        pdfUrl: order.invoiceUrl,
        createdAt: order.updatedAt
      });
      return;
    }

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
      expires: new Date('2100-01-01T00:00:00.000Z')
    });

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
      pdfUrl: signedUrl,
      createdAt: now
    };

    await Promise.all([
      database.ref(`invoices/${invoiceId}`).set(invoiceRecord),
      database.ref(`orders/${orderId}`).update({
        invoiceId,
        invoiceNumber,
        invoiceUrl: signedUrl,
        updatedAt: now
      })
    ]);

    res.status(200).json(invoiceRecord);
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message || 'Invoice generation failed in the Vercel API route.'
          : 'Invoice generation failed in the Vercel API route.'
    });
  }
};

function getAdminApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKey || !databaseURL || !storageBucket) {
    throw new Error('Missing Firebase Admin configuration for the Vercel API route.');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    }),
    databaseURL,
    storageBucket
  });
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

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
  drawLabelValue(page, 'Payment', String(order.paymentType || '').toUpperCase(), 40, cursorY, boldFont, font);
  drawLabelValue(page, 'Status', String(order.status || '').toUpperCase(), 300, cursorY, boldFont, font);
  cursorY -= 20;
  drawLabelValue(page, 'Deliver To', formatAddress(order.shippingAddress), 40, cursorY, boldFont, font);
  cursorY -= 36;

  page.drawText('Items', { x: 40, y: cursorY, size: 14, font: boldFont, color: rgb(0.12, 0.16, 0.12) });
  cursorY -= 22;

  for (const line of order.products || []) {
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
  return [address?.line1, address?.line2, address?.city, address?.state, address?.postalCode].filter(Boolean).join(', ');
}