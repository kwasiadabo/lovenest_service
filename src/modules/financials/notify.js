const { StudentParent, Parent } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const { sendSms } = require('../../utils/sms');
const { sendMail } = require('../../utils/mailer');
const { decryptSecret } = require('../../utils/secretCrypto');
const { buildReceiptPdf, resolveLogoPath } = require('../../utils/receiptPdf');

const METHOD_LABELS = {
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile money',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
};

function formatAmount(amountPesewas) {
  return `GHS ${(amountPesewas / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function getStudentParents(schoolId, studentId) {
  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId },
    include: [Parent],
  });
  // A student can list the same phone/email as both parents (or two links to
  // the same Parent record) — dedupe so a payment doesn't send twice.
  const byId = new Map(links.map((l) => [l.Parent.id, l.Parent]));
  return [...byId.values()];
}

function receiptEmailHtml({
  school, student, payment, balancePesewas, description,
}) {
  const balanceLine = balancePesewas > 0
    ? `<p>Outstanding balance: <strong>${formatAmount(balancePesewas)}</strong></p>`
    : '<p>This account is now <strong>paid in full</strong>.</p>';
  const isCorrection = !!payment.lastEditedByUserId;

  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b;">
      ${school?.logoUrl ? '<img src="cid:school-logo" alt="School logo" style="height:48px;margin-bottom:12px;" />' : ''}
      <h2 style="margin-bottom:4px;">${school?.name || 'School'}</h2>
      <p>Dear Parent/Guardian,</p>
      ${isCorrection ? `<p><strong>This receipt has been corrected.</strong> The details below replace what was previously sent for receipt #${payment.receiptNumber}.</p>` : ''}
      <p>
        We confirm receipt of <strong>${formatAmount(payment.amountPesewas)}</strong>
        for <strong>${student.fullName}</strong> (Student No. ${student.studentNumber})
        on ${new Date(payment.paidDate).toLocaleDateString()} via ${METHOD_LABELS[payment.method] || payment.method}.
      </p>
      ${description ? `<p>Payment for: <strong>${description}</strong></p>` : ''}
      <p>Receipt number: <strong>${payment.receiptNumber}</strong></p>
      ${balanceLine}
      <p>The full receipt is attached as a PDF.</p>
      <p>Thank you.</p>
    </div>
  `;
}

// Fire-and-report: every SMS/email attempt is individually try/caught so one
// parent's bad number or a transient mail failure never blocks the others,
// and never blocks/fails the payment that triggered it.
async function notifyPaymentReceipt(schoolId, {
  school, student, payment, balancePesewas, issuedByName, description,
}) {
  const parents = await getStudentParents(schoolId, student.id);
  const summary = {
    sms: { attempted: 0, sent: 0, failed: 0 },
    email: { attempted: 0, sent: 0, failed: 0 },
  };

  if (parents.length === 0) return summary;

  const pdfBuffer = await buildReceiptPdf({
    school, student, payment, issuedByName, balancePesewas, description,
  });

  const isCorrection = !!payment.lastEditedByUserId;
  // e.g. " (Transport fee payment — Term 2 (2025/2026))" — omitted entirely
  // for payment types that don't pass one (fees today).
  const descriptionSuffix = description ? ` (${description})` : '';
  const smsMessage = isCorrection
    ? `Dear Parent, receipt #${payment.receiptNumber} for ${student.fullName}${descriptionSuffix} has been corrected: `
      + `${formatAmount(payment.amountPesewas)} via ${METHOD_LABELS[payment.method] || payment.method} `
      + `on ${new Date(payment.paidDate).toLocaleDateString()}. `
      + `${balancePesewas > 0 ? `Balance: ${formatAmount(balancePesewas)}.` : 'Paid in full.'} - ${school?.name || 'School'}`
    : `Dear Parent, ${formatAmount(payment.amountPesewas)} payment received for `
      + `${student.fullName}${descriptionSuffix} on ${new Date(payment.paidDate).toLocaleDateString()} via `
      + `${METHOD_LABELS[payment.method] || payment.method}. Receipt #${payment.receiptNumber}. `
      + `${balancePesewas > 0 ? `Balance: ${formatAmount(balancePesewas)}.` : 'Paid in full.'} - ${school?.name || 'School'}`;

  const logoPath = resolveLogoPath(school?.logoUrl);
  const emailAppPassword = decryptSecret(school?.emailAppPasswordEncrypted);

  // Each parent's SMS and email are independent network calls with no
  // ordering requirement between them — sent concurrently (both across
  // parents and, within a parent, SMS alongside email) rather than one at a
  // time, so the total wait is roughly the slowest single send rather than
  // the sum of every send. This is what recordPayment's caller is actually
  // blocked on, so it's the main lever for how long recording a payment
  // takes to respond.
  const perParentResults = await Promise.all(parents.map(async (parent) => {
    const result = {};
    const tasks = [];

    if (parent.phone) {
      tasks.push(
        sendSms({ to: parent.phone, message: smsMessage, senderId: school?.smsSenderId, schoolId })
          .then((r) => { result.sms = r; }),
      );
    }

    if (parent.email) {
      tasks.push(
        sendMail({
          to: parent.email,
          subject: isCorrection
            ? `Corrected payment receipt — ${student.fullName} (${payment.receiptNumber})`
            : `Payment receipt — ${student.fullName} (${payment.receiptNumber})`,
          html: receiptEmailHtml({
            school, student, payment, balancePesewas, description,
          }),
          attachments: [
            { filename: `receipt-${payment.receiptNumber}.pdf`, content: pdfBuffer },
            ...(logoPath ? [{ filename: 'logo.png', path: logoPath, cid: 'school-logo' }] : []),
          ],
          emailUser: school?.emailUser,
          emailAppPassword,
          fromName: school?.name,
        }).then((r) => { result.email = r; }),
      );
    }

    await Promise.all(tasks);
    return result;
  }));

  for (const result of perParentResults) {
    if (result.sms) {
      summary.sms.attempted += 1;
      if (result.sms.ok) summary.sms.sent += 1;
      else summary.sms.failed += 1;
    }
    if (result.email) {
      summary.email.attempted += 1;
      if (result.email.ok) summary.email.sent += 1;
      else summary.email.failed += 1;
    }
  }

  return summary;
}

module.exports = { notifyPaymentReceipt };
