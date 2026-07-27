const PDFDocument = require('pdfkit');
const { fetchLogoBuffer } = require('./receiptPdf');

const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';

// pdfkit's standard fonts can't render the ₵ glyph, so payslips use the
// "GHS" prefix instead — same convention as receiptPdf.js.
function formatAmount(amountPesewas) {
  return `GHS ${(amountPesewas / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateLong(dateInput) {
  return new Date(dateInput).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function parseBreakdown(payslip) {
  try {
    return JSON.parse(payslip.breakdownJson);
  } catch {
    return null;
  }
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

// Every line item gets its own bottom rule — a visible row divider, not just
// vertical spacing — so the earnings/deductions read as a lined list rather
// than loose floating text.
function drawRow(doc, y, label, value, { bold = false, muted = false } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10.5 : 10);
  doc.fillColor(muted ? MUTED : INK).text(label, MARGIN, y, { width: CONTENT_WIDTH * 0.6 });
  doc.text(value, MARGIN, y, { width: CONTENT_WIDTH, align: 'right' });
  const rowHeight = bold ? 18 : 16;
  const ruleY = y + rowHeight - 5;
  doc.strokeColor(BORDER).lineWidth(0.75).moveTo(MARGIN, ruleY).lineTo(PAGE.width - MARGIN, ruleY).stroke();
  return y + rowHeight;
}

// Server-side payslip PDF — attached to the automatic email a staff member
// gets once their payroll run is paid (see payroll/notify.js), and reused
// for the on-demand "Payslip PDF" download in the admin/self-service UI.
async function buildPayslipPdf({
  school, staff, payrollRun, payslip,
}) {
  const logoBuffer = await fetchLogoBuffer(school?.logoUrl);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = MARGIN;
    const frameTop = MARGIN - 14;
    const LOGO_SIZE = 64;
    const textX = logoBuffer ? MARGIN + LOGO_SIZE + 12 : MARGIN;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, MARGIN, y, { width: LOGO_SIZE, height: LOGO_SIZE });
      } catch {
        // Malformed/unreadable logo image — skip it rather than break the payslip.
      }
    }
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(school?.name || 'School', textX, y, { width: CONTENT_WIDTH - (textX - MARGIN) });
    y += 22;
    doc.font('Helvetica-Bold').fontSize(18).text('Payslip', textX, y);
    y += 26;
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(payrollRun.payPeriodLabel, textX, y);
    // Extra clearance (was +24) so the taller logo has room to breathe above
    // the rule, rather than the text column dictating the gap on its own.
    y = Math.max(y + 34, MARGIN + LOGO_SIZE + 18);

    doc.strokeColor(BORDER).lineWidth(1).moveTo(MARGIN, y).lineTo(PAGE.width - MARGIN, y).stroke();
    y += 20;

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(staff?.fullName || 'Staff', MARGIN, y);
    y += 15;
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(staff?.position || '', MARGIN, y);
    y += 14;
    doc.text(`Pay period: ${formatDateLong(payrollRun.payPeriodStart)} — ${formatDateLong(payrollRun.payPeriodEnd)}`, MARGIN, y);
    y += 28;

    const breakdown = parseBreakdown(payslip);

    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('EARNINGS', MARGIN, y);
    y += 16;
    if (breakdown) {
      y = drawRow(doc, y, 'Basic Salary', formatAmount(breakdown.basicSalaryPesewas));
      (breakdown.allowances || []).forEach((a) => {
        const amount = a.calcMethod === 'FIXED' ? a.amountPesewas : Math.round((breakdown.basicSalaryPesewas * Number(a.percent || 0)) / 100);
        y = drawRow(doc, y, a.name, formatAmount(amount));
      });
    }
    y += 4;
    y = drawRow(doc, y, 'Gross Pay', formatAmount(payslip.grossPesewas), { bold: true });
    y += 16;

    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('DEDUCTIONS', MARGIN, y);
    y += 16;
    y = drawRow(doc, y, 'PAYE Tax', formatAmount(payslip.payePesewas));
    y = drawRow(doc, y, 'SSNIT (employee)', formatAmount(payslip.ssnitEmployeePesewas));
    if (payslip.otherDeductionsPesewas) {
      y = drawRow(doc, y, 'Other Deductions', formatAmount(payslip.otherDeductionsPesewas));
    }
    y += 4;
    const totalDeductions = payslip.payePesewas + payslip.ssnitEmployeePesewas + payslip.otherDeductionsPesewas;
    y = drawRow(doc, y, 'Total Deductions', formatAmount(totalDeductions), { bold: true });
    y += 20;

    doc.strokeColor(BORDER).lineWidth(1).moveTo(MARGIN, y).lineTo(PAGE.width - MARGIN, y).stroke();
    y += 18;
    // The one number on the slip that matters most at a glance — largest and
    // boldest text on the page, deliberately more than Gross Pay/Total
    // Deductions above (those are bold at 10.5pt; this is bold at 15pt).
    doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text('NET PAY', MARGIN, y);
    doc.text(formatAmount(payslip.netPesewas), MARGIN, y, { width: CONTENT_WIDTH, align: 'right' });
    y += 32;

    // Outer frame around the whole payslip — the per-row rules above divide
    // line items, this closes the loop around the document as a whole.
    doc.strokeColor(BORDER).lineWidth(1).rect(frameTop, frameTop, PAGE.width - frameTop * 2, y - frameTop).stroke();

    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
      `Generated ${formatDateLong(new Date())} — this is a system-generated payslip and does not require a signature.`,
      MARGIN,
      PAGE.height - MARGIN - 20,
      { width: CONTENT_WIDTH },
    );

    doc.end();
  });
}

module.exports = { buildPayslipPdf };
