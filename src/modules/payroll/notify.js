const { sendMail } = require('../../utils/mailer');
const { decryptSecret } = require('../../utils/secretCrypto');
const { buildPayslipPdf } = require('../../utils/payslipPdf');

function formatAmount(amountPesewas) {
  return `GHS ${(amountPesewas / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function payslipEmailHtml({ school, staff, payrollRun, payslip }) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b;">
      ${school?.logoUrl ? '<img src="cid:school-logo" alt="School logo" style="height:48px;margin-bottom:12px;" />' : ''}
      <h2 style="margin-bottom:4px;">${school?.name || 'School'}</h2>
      <p>Dear ${staff.fullName},</p>
      <p>
        Your salary for <strong>${payrollRun.payPeriodLabel}</strong> has been prepared.
        Net pay: <strong>${formatAmount(payslip.netPesewas)}</strong>.
      </p>
      <p>
        This amount has been processed by the school and sent for transfer to your bank account. It may take a
        short while to reflect — please allow some time before checking with your bank.
      </p>
      <p>Your payslip is attached as a PDF.</p>
      <p>Thank you.</p>
    </div>
  `;
}

// Fire-and-report, same convention as financials/notify.js#notifyPaymentReceipt
// — every staff email is individually try/caught so one bad address or a
// transient mail failure never blocks the others, and never fails (or rolls
// back) a payroll run that's already posted and paid.
async function notifyPayslips(schoolId, { school, payrollRun, payslips }) {
  const summary = { email: { attempted: 0, sent: 0, failed: 0 } };
  if (!payslips?.length) return summary;

  const emailAppPassword = decryptSecret(school?.emailAppPasswordEncrypted);

  for (const payslip of payslips) {
    const staff = payslip.Staff;
    if (!staff?.email) continue;

    summary.email.attempted += 1;
    try {
      const pdfBuffer = await buildPayslipPdf({
        school, staff, payrollRun, payslip,
      });
      const result = await sendMail({
        to: staff.email,
        subject: `Payslip — ${payrollRun.payPeriodLabel}`,
        html: payslipEmailHtml({
          school, staff, payrollRun, payslip,
        }),
        attachments: [
          { filename: `payslip-${payrollRun.payPeriodLabel}.pdf`, content: pdfBuffer },
          // nodemailer's `path` accepts a remote URL directly and streams
          // it when sending — no local file resolution needed.
          ...(school?.logoUrl ? [{ filename: 'logo.png', path: school.logoUrl, cid: 'school-logo' }] : []),
        ],
        emailUser: school?.emailUser,
        emailAppPassword,
        fromName: school?.name,
      });
      if (result.ok) summary.email.sent += 1;
      else summary.email.failed += 1;
    } catch {
      summary.email.failed += 1;
    }
  }

  return summary;
}

module.exports = { notifyPayslips };
