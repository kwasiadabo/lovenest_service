const PDFDocument = require('pdfkit');

const METHOD_LABELS = {
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile money',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
};

const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const ACCENT = '#1e293b';
const AMBER_BG = '#fef3c7';
const AMBER_TEXT = '#92400e';

// pdfkit's standard fonts can't render the ₵ glyph, so receipts use the
// "GHS" prefix instead — same convention as the frontend's bill PDF export.
function formatAmount(amountPesewas) {
  return `GHS ${(amountPesewas / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateLong(dateInput) {
  return new Date(dateInput).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

function threeDigitsToWords(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(ONES[Math.floor(n / 100)], 'Hundred');
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]);
    if (n % 10 > 0) parts.push(ONES[n % 10]);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

function integerToWords(value) {
  if (value === 0) return 'Zero';
  let n = value;
  let scaleIndex = 0;
  const chunks = [];
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const scale = SCALES[scaleIndex];
      chunks.unshift(`${threeDigitsToWords(chunk)}${scale ? ` ${scale}` : ''}`);
    }
    n = Math.floor(n / 1000);
    scaleIndex += 1;
  }
  return chunks.join(' ');
}

// Standard feature of an official Ghanaian receipt — spells out the amount
// so it can't be silently altered after issue.
function amountInWords(amountPesewas) {
  const cedis = Math.floor(amountPesewas / 100);
  const pesewas = amountPesewas % 100;
  const cedisWords = `${integerToWords(cedis)} Ghana Cedi${cedis === 1 ? '' : 's'}`;
  if (pesewas === 0) return `${cedisWords} Only`;
  return `${cedisWords} and ${integerToWords(pesewas)} Pesewa${pesewas === 1 ? '' : 's'} Only`;
}

// logoUrl is an absolute Cloudinary URL — pdfkit's doc.image() accepts a
// Buffer directly, so fetch it over HTTP rather than resolving a local
// path. Returns null (never throws) on any failure — a missing/unreachable
// logo shouldn't break PDF generation, same as the try/catch already
// wrapping every doc.image() call site below.
async function fetchLogoBuffer(logoUrl) {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const PAGE = { width: 595.28, height: 841.89 };
const CARD = { x: 40, y: 40, width: 515.28 };
const PAD = 24;
const INNER_X = CARD.x + PAD;
const INNER_RIGHT = CARD.x + CARD.width - PAD;
const INNER_WIDTH = CARD.width - PAD * 2;

async function buildReceiptPdf({
  school, student, payment, issuedByName, balancePesewas, description = 'School fees payment',
}) {
  const logoBuffer = await fetchLogoBuffer(school?.logoUrl);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const isCorrection = !!payment.lastEditedByUserId;
    let y = CARD.y + PAD;

    // ---- Header: school identity (left) + receipt metadata (right) ----
    const textX = logoBuffer ? INNER_X + 56 : INNER_X;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, INNER_X, y, { width: 44, height: 44 });
      } catch {
        // Malformed/unreadable logo image — skip it rather than break the receipt.
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
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(payment.receiptNumber, metaX, y + 13, { width: metaWidth, align: 'right' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Date: ${formatDateLong(payment.paidDate)}`, metaX, y + 32, { width: metaWidth, align: 'right' });

    if (isCorrection) {
      const pillWidth = 74;
      const pillX = INNER_RIGHT - pillWidth;
      const pillY = y + 46;
      doc.roundedRect(pillX, pillY, pillWidth, 14, 7).fill(AMBER_BG);
      doc.fillColor(AMBER_TEXT).font('Helvetica-Bold').fontSize(7).text('CORRECTED', pillX, pillY + 4, { width: pillWidth, align: 'center', characterSpacing: 0.4 });
    }

    y += 64;
    doc.moveTo(INNER_X, y).lineTo(INNER_RIGHT, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    // ---- Student ----
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('RECEIVED FROM', INNER_X, y, { characterSpacing: 0.6 });
    y += 13;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(student.fullName, INNER_X, y);
    y += 16;
    const studentMeta = [`Student No. ${student.studentNumber}`, student.classLabel || 'No class assigned'].join('   ·   ');
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(studentMeta, INNER_X, y);
    y += 22;

    doc.moveTo(INNER_X, y).lineTo(INNER_RIGHT, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    // ---- Payment details table ----
    const col = { description: INNER_X + 8, reference: INNER_X + 280, amount: INNER_RIGHT - 8 };
    doc.rect(INNER_X, y, INNER_WIDTH, 24).fill(ACCENT);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('DESCRIPTION', col.description, y + 8);
    doc.text('REFERENCE', col.reference, y + 8);
    doc.text('AMOUNT', INNER_X, y + 8, { width: INNER_WIDTH - 8, align: 'right' });
    y += 24;

    const rowHeight = 26;
    doc.rect(INNER_X, y, INNER_WIDTH, rowHeight).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(INK).font('Helvetica').fontSize(9);
    doc.text(`${description} — ${METHOD_LABELS[payment.method] || payment.method}`, col.description, y + 8, { width: 260 });
    doc.fillColor(MUTED).text(payment.reference || '—', col.reference, y + 8, { width: 140 });
    doc.fillColor(INK).font('Helvetica-Bold').text(formatAmount(payment.amountPesewas), INNER_X, y + 8, { width: INNER_WIDTH - 8, align: 'right' });
    y += rowHeight;

    doc.rect(INNER_X, y, INNER_WIDTH, 24).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('TOTAL PAID', col.description, y + 8, { characterSpacing: 0.4 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(formatAmount(payment.amountPesewas), INNER_X, y + 6, { width: INNER_WIDTH - 8, align: 'right' });
    y += 24;

    if (payment.notes) {
      y += 8;
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Note: ${payment.notes}`, INNER_X, y, { width: INNER_WIDTH });
      y += doc.heightOfString(`Note: ${payment.notes}`, { width: INNER_WIDTH });
    }

    y += 14;
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8.5).text(`Amount in words: ${amountInWords(payment.amountPesewas)}`, INNER_X, y, { width: INNER_WIDTH });
    y += doc.heightOfString(`Amount in words: ${amountInWords(payment.amountPesewas)}`, { width: INNER_WIDTH }) + 18;

    // ---- Balance summary ----
    const balanceBoxHeight = 76;
    doc.rect(INNER_X, y, INNER_WIDTH, balanceBoxHeight).fill('#f8fafc');
    let by = y + 12;
    const balanceBeforePesewas = balancePesewas + payment.amountPesewas;

    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Balance before payment', INNER_X + 12, by);
    doc.fillColor(INK).text(formatAmount(balanceBeforePesewas), INNER_X, by, { width: INNER_WIDTH - 12, align: 'right' });
    by += 16;
    doc.fillColor(MUTED).text('Amount paid', INNER_X + 12, by);
    doc.fillColor(INK).text(`- ${formatAmount(payment.amountPesewas)}`, INNER_X, by, { width: INNER_WIDTH - 12, align: 'right' });
    by += 18;
    doc.moveTo(INNER_X + 12, by).lineTo(INNER_RIGHT - 12, by).strokeColor(BORDER).lineWidth(1).stroke();
    by += 10;

    const balanceLabel = balancePesewas > 0 ? 'Balance owing' : 'Balance';
    const balanceText = balancePesewas > 0 ? formatAmount(balancePesewas) : 'Paid in full';
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(balanceLabel, INNER_X + 12, by);
    doc.text(balanceText, INNER_X, by, { width: INNER_WIDTH - 12, align: 'right' });

    y += balanceBoxHeight + 20;

    if (isCorrection) {
      const note = `This receipt reflects a correction made on ${formatDateLong(payment.updatedAt)}.`;
      doc.fillColor(AMBER_TEXT).font('Helvetica').fontSize(8).text(note, INNER_X, y, { width: INNER_WIDTH });
      y += doc.heightOfString(note, { width: INNER_WIDTH }) + 12;
    }

    // ---- Footer: issuer / signature / generated timestamp ----
    doc.moveTo(INNER_X, y).lineTo(INNER_RIGHT, y).strokeColor(BORDER).lineWidth(1).stroke();
    y += 16;

    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Issued by', INNER_X, y);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(issuedByName || '—', INNER_X, y + 11);

    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Generated', INNER_X, y, { width: INNER_WIDTH, align: 'right' });
    doc.text(new Date().toLocaleString(), INNER_X, y + 11, { width: INNER_WIDTH, align: 'right' });

    y += 34;
    doc.moveTo(INNER_X, y).lineTo(INNER_X + 160, y).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(7).text('Authorized Signature / Stamp', INNER_X, y + 4);

    y += 30;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text('Thank you for your payment.', INNER_X, y, { width: INNER_WIDTH, align: 'center' });
    y += 14;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text('This is a system-generated receipt.', INNER_X, y, { width: INNER_WIDTH, align: 'center' });

    y += 24;
    doc.roundedRect(CARD.x, CARD.y, CARD.width, y - CARD.y, 10).strokeColor(BORDER).lineWidth(1).stroke();

    doc.end();
  });
}

module.exports = {
  buildReceiptPdf,
  fetchLogoBuffer,
  formatAmount,
  formatDateLong,
  amountInWords,
  INK,
  MUTED,
  BORDER,
  ACCENT,
};
