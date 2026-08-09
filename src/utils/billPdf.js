const PDFDocument = require('pdfkit');
const { fetchLogoBuffer } = require('./receiptPdf');

const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const ACCENT = '#1e293b';
const AMBER_TEXT = '#b45309';
const GREEN_TEXT = '#15803d';

// pdfkit's standard fonts can't render the ₵ glyph, so bills use the "GHS"
// prefix instead — same convention as receiptPdf.js and the frontend's own
// bill PDF export.
function formatAmount(amountPesewas) {
  return `GHS ${(amountPesewas / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateLong(dateInput) {
  return new Date(dateInput).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Same row shape/ordering as frontend financials/billItems.js#buildDisplayItems
// and financials/notify.js#buildBillEmailRows (the HTML email) — arrears
// always gets its own row when present, and a bill carries at most one of
// DISCOUNT/INDIVIDUAL_DISCOUNT, shown under whichever label actually applied.
const DISCOUNT_SOURCES = ['DISCOUNT', 'INDIVIDUAL_DISCOUNT'];
const DISCOUNT_LABELS = { DISCOUNT: 'Sibling discount', INDIVIDUAL_DISCOUNT: 'Individual discount' };

function buildBillRows(bill) {
  const items = bill.items || [];
  const arrearsItem = items.find((item) => item.source === 'ARREARS');
  const discountItem = items.find((item) => DISCOUNT_SOURCES.includes(item.source));

  const rows = items
    .filter((item) => item.source !== 'ARREARS' && !DISCOUNT_SOURCES.includes(item.source))
    .map((item) => ({ label: item.FeeType?.name || 'Other', amountPesewas: item.amountPesewas }));

  if (discountItem) {
    rows.push({ label: DISCOUNT_LABELS[discountItem.source], amountPesewas: discountItem.amountPesewas, isDiscount: true });
  }
  if (arrearsItem) {
    rows.push({ label: 'Arrears (balance brought forward)', amountPesewas: arrearsItem.amountPesewas, isArrears: true });
  }
  return rows;
}

const PAGE = { width: 595.28, height: 841.89 };
const CARD = { x: 40, y: 40, width: 515.28 };
const PAD = 24;
const INNER_X = CARD.x + PAD;
const INNER_RIGHT = CARD.x + CARD.width - PAD;
const INNER_WIDTH = CARD.width - PAD * 2;

// One page, one bill — same card-on-a-page shape as receiptPdf.js#buildReceiptPdf
// (deliberately simpler than the frontend's per-student invoice PDF, which
// has its own diagonal-decor branding; this is the version attached to the
// "bill confirmed" and "email bills to parents" emails).
async function buildBillPdf({ school, bill, periodLabel }) {
  const logoBuffer = await fetchLogoBuffer(school?.logoUrl);
  const rows = buildBillRows(bill);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = CARD.y + PAD;

    // ---- Header: school identity (left) + bill metadata (right) ----
    const textX = logoBuffer ? INNER_X + 56 : INNER_X;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, INNER_X, y, { width: 44, height: 44 });
      } catch {
        // Malformed/unreadable logo image — skip it rather than break the bill.
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
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('BILL', metaX, y, { width: metaWidth, align: 'right', characterSpacing: 0.6 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(periodLabel || bill.periodLabel || '—', metaX, y + 13, { width: metaWidth, align: 'right' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Confirmed: ${formatDateLong(bill.confirmedAt || bill.createdAt)}`, metaX, y + 32, { width: metaWidth, align: 'right' });

    y += 64;
    doc.moveTo(INNER_X, y).lineTo(INNER_RIGHT, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    // ---- Student ----
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('STUDENT', INNER_X, y, { characterSpacing: 0.6 });
    y += 13;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(bill.Student?.fullName || '—', INNER_X, y);
    y += 16;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(`Student No. ${bill.Student?.studentNumber || '—'}`, INNER_X, y);
    y += 22;

    doc.moveTo(INNER_X, y).lineTo(INNER_RIGHT, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    // ---- Fee items table ----
    doc.rect(INNER_X, y, INNER_WIDTH, 24).fill(ACCENT);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('ITEM', INNER_X + 8, y + 8);
    doc.text('AMOUNT', INNER_X, y + 8, { width: INNER_WIDTH - 8, align: 'right' });
    y += 24;

    const rowHeight = 22;
    rows.forEach((row) => {
      doc.rect(INNER_X, y, INNER_WIDTH, rowHeight).strokeColor(BORDER).lineWidth(1).stroke();
      const color = row.isArrears ? AMBER_TEXT : row.isDiscount ? GREEN_TEXT : INK;
      doc.fillColor(color).font('Helvetica').fontSize(9).text(row.label, INNER_X + 8, y + 7, { width: INNER_WIDTH - 100 });
      doc.font('Helvetica-Bold').text(formatAmount(row.amountPesewas), INNER_X, y + 7, { width: INNER_WIDTH - 8, align: 'right' });
      y += rowHeight;
    });
    if (rows.length === 0) {
      doc.rect(INNER_X, y, INNER_WIDTH, rowHeight).strokeColor(BORDER).lineWidth(1).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No items on this bill', INNER_X + 8, y + 7);
      y += rowHeight;
    }

    doc.rect(INNER_X, y, INNER_WIDTH, 26).fill('#f8fafc');
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('TOTAL', INNER_X + 8, y + 9, { characterSpacing: 0.4 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(formatAmount(bill.totalPesewas), INNER_X, y + 7, { width: INNER_WIDTH - 8, align: 'right' });
    y += 26 + 24;

    // ---- Footer ----
    doc.moveTo(INNER_X, y).lineTo(INNER_RIGHT, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Generated', INNER_X, y, { width: INNER_WIDTH, align: 'right' });
    doc.text(new Date().toLocaleString(), INNER_X, y + 11, { width: INNER_WIDTH, align: 'right' });

    y += 34;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text('Please log in to the Parent Portal to make a payment.', INNER_X, y, { width: INNER_WIDTH, align: 'center' });
    y += 14;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text('This is a system-generated bill.', INNER_X, y, { width: INNER_WIDTH, align: 'center' });

    y += 24;
    doc.roundedRect(CARD.x, CARD.y, CARD.width, y - CARD.y, 10).strokeColor(BORDER).lineWidth(1).stroke();

    doc.end();
  });
}

module.exports = { buildBillPdf, buildBillRows, formatAmount };
