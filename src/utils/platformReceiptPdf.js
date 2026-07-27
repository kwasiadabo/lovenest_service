const PDFDocument = require('pdfkit');
const {
  resolveLogoPath, formatAmount, formatDateLong, amountInWords, INK, MUTED, BORDER, ACCENT,
} = require('./receiptPdf');

// A simpler sibling of receiptPdf.js#buildReceiptPdf, for the platform-level
// payments a school itself owes (subscription renewals, the one-time
// training fee) — no student/balance section, since those concepts don't
// apply here. Shares the same visual language (colors, amount formatting,
// amount-in-words) via receiptPdf.js's exports rather than re-deriving them.
const PAGE = { width: 595.28, height: 841.89 };
const CARD = { x: 40, y: 40, width: 515.28 };
const PAD = 24;
const INNER_X = CARD.x + PAD;
const INNER_RIGHT = CARD.x + CARD.width - PAD;
const INNER_WIDTH = CARD.width - PAD * 2;

function buildPlatformPaymentReceiptPdf({ school, payment, description }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = CARD.y + PAD;

    const logoPath = resolveLogoPath(school?.logoUrl);
    const textX = logoPath ? INNER_X + 56 : INNER_X;
    if (logoPath) {
      try {
        doc.image(logoPath, INNER_X, y, { width: 44, height: 44 });
      } catch {
        // Malformed/unreadable logo file — skip it rather than break the receipt.
      }
    }

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(school?.name || 'School', textX, y, { width: 220 });
    let schoolLineY = y + 19;
    if (school?.address) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(school.address, textX, schoolLineY, { width: 220 });
      schoolLineY += 12;
    }
    const contactLine = [school?.phone, school?.email].filter(Boolean).join('  ·  ');
    if (contactLine) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(contactLine, textX, schoolLineY, { width: 220 });
    }

    const metaX = INNER_X + 267;
    const metaWidth = INNER_RIGHT - metaX;
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('PAYMENT RECEIPT', metaX, y, { width: metaWidth, align: 'right', characterSpacing: 0.6 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(payment.reference, metaX, y + 13, { width: metaWidth, align: 'right' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Date: ${formatDateLong(payment.paidAt)}`, metaX, y + 32, { width: metaWidth, align: 'right' });

    y += 64;
    doc.moveTo(INNER_X, y).lineTo(INNER_RIGHT, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 20;

    const col = { description: INNER_X + 8, reference: INNER_X + 280 };
    doc.rect(INNER_X, y, INNER_WIDTH, 24).fill(ACCENT);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('DESCRIPTION', col.description, y + 8);
    doc.text('STATUS', col.reference, y + 8);
    doc.text('AMOUNT', INNER_X, y + 8, { width: INNER_WIDTH - 8, align: 'right' });
    y += 24;

    const rowHeight = 26;
    doc.rect(INNER_X, y, INNER_WIDTH, rowHeight).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(INK).font('Helvetica').fontSize(9);
    doc.text(description, col.description, y + 8, { width: 260 });
    doc.fillColor(MUTED).text('Paid', col.reference, y + 8, { width: 140 });
    doc.fillColor(INK).font('Helvetica-Bold').text(formatAmount(payment.amountPesewas), INNER_X, y + 8, { width: INNER_WIDTH - 8, align: 'right' });
    y += rowHeight;

    doc.rect(INNER_X, y, INNER_WIDTH, 24).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('TOTAL PAID', col.description, y + 8, { characterSpacing: 0.4 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(formatAmount(payment.amountPesewas), INNER_X, y + 6, { width: INNER_WIDTH - 8, align: 'right' });
    y += 24;

    y += 22;
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8.5).text(`Amount in words: ${amountInWords(payment.amountPesewas)}`, INNER_X, y, { width: INNER_WIDTH });
    y += doc.heightOfString(`Amount in words: ${amountInWords(payment.amountPesewas)}`, { width: INNER_WIDTH }) + 24;

    doc.moveTo(INNER_X, y).lineTo(INNER_RIGHT, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Paid by', INNER_X, y);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(school?.name || '—', INNER_X, y + 11);

    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Generated', INNER_X, y, { width: INNER_WIDTH, align: 'right' });
    doc.text(new Date().toLocaleString(), INNER_X, y + 11, { width: INNER_WIDTH, align: 'right' });

    y += 40;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text('Thank you for your payment.', INNER_X, y, { width: INNER_WIDTH, align: 'center' });
    y += 14;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text('This is a system-generated receipt.', INNER_X, y, { width: INNER_WIDTH, align: 'center' });

    y += 24;
    doc.roundedRect(CARD.x, CARD.y, CARD.width, y - CARD.y, 10).strokeColor(BORDER).lineWidth(1).stroke();

    doc.end();
  });
}

module.exports = { buildPlatformPaymentReceiptPdf };
