const { StudentParent, Parent } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const { sendSms } = require('../../utils/sms');
const { sendMail } = require('../../utils/mailer');
const { decryptSecret } = require('../../utils/secretCrypto');
const { buildReceiptPdf } = require('../../utils/receiptPdf');
const { buildBillPdf, buildBillRows } = require('../../utils/billPdf');

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

function billEmailHtml({ school, bill, periodLabel }) {
  const rowsHtml = buildBillRows(bill).map((row) => `
    <tr>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;">${row.label}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatAmount(row.amountPesewas)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b;">
      ${school?.logoUrl ? '<img src="cid:school-logo" alt="School logo" style="height:48px;margin-bottom:12px;" />' : ''}
      <h2 style="margin-bottom:4px;">${school?.name || 'School'}</h2>
      <p>Dear Parent/Guardian,</p>
      <p>
        A bill has been confirmed for <strong>${bill.Student.fullName}</strong>
        (Student No. ${bill.Student.studentNumber})${periodLabel ? ` — <strong>${periodLabel}</strong>` : ''}.
      </p>
      <table style="border-collapse:collapse;width:100%;margin:12px 0;">
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td style="padding:6px 8px;font-weight:bold;">Total</td>
            <td style="padding:6px 8px;font-weight:bold;text-align:right;">${formatAmount(bill.totalPesewas)}</td>
          </tr>
        </tfoot>
      </table>
      <p>The full bill is attached as a PDF. Please log in to the Parent Portal to make a payment.</p>
      <p>Thank you.</p>
    </div>
  `;
}

// Email-only (no SMS — a full fee breakdown doesn't fit a text message the
// way a payment receipt's single amount does), one email per bill per
// parent. Same best-effort contract as notifyPaymentReceipt below: every
// send is individually try/caught via sendMail's own { ok: false } return,
// never throws, and must never block/fail the confirmation that triggered
// it. Used both right after a bill is confirmed and by the standalone
// "Email bills to parents" action on already-confirmed bills.
async function notifyBillEmail(schoolId, { school, bill }) {
  const summary = { email: { attempted: 0, sent: 0, failed: 0 } };
  const parents = (await getStudentParents(schoolId, bill.studentId)).filter((p) => p.email);
  if (parents.length === 0) return summary;

  const emailAppPassword = decryptSecret(school?.emailAppPasswordEncrypted);
  const periodLabel = bill.Term?.name || bill.periodLabel || null;
  const pdfBuffer = await buildBillPdf({ school, bill, periodLabel });

  const results = await Promise.all(parents.map((parent) => sendMail({
    to: parent.email,
    subject: `Bill confirmed — ${bill.Student.fullName}${periodLabel ? ` (${periodLabel})` : ''}`,
    html: billEmailHtml({ school, bill, periodLabel }),
    attachments: [
      { filename: `bill-${bill.periodKey || bill.id}.pdf`, content: pdfBuffer },
      ...(school?.logoUrl ? [{ filename: 'logo.png', path: school.logoUrl, cid: 'school-logo' }] : []),
    ],
    emailUser: school?.emailUser,
    emailAppPassword,
    fromName: school?.name,
  })));

  summary.email.attempted = results.length;
  summary.email.sent = results.filter((r) => r.ok).length;
  summary.email.failed = results.filter((r) => !r.ok).length;
  return summary;
}

// Runs notifyBillEmail across many bills concurrently (each bill's parent
// sends are already internally concurrent) rather than one bill at a time —
// the same "don't pay for N sequential network round trips" fix applied to
// confirmBills' DB work below, just for the email fan-out side of it.
async function notifyBillsEmailed(schoolId, { school, bills }) {
  const perBillResults = await Promise.all(bills.map((bill) => notifyBillEmail(schoolId, { school, bill })));
  return perBillResults.reduce((summary, r) => ({
    email: {
      attempted: summary.email.attempted + r.email.attempted,
      sent: summary.email.sent + r.email.sent,
      failed: summary.email.failed + r.email.failed,
    },
  }), { email: { attempted: 0, sent: 0, failed: 0 } });
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
            // nodemailer's `path` accepts a remote URL directly and streams
            // it when sending — no local file resolution needed.
            ...(school?.logoUrl ? [{ filename: 'logo.png', path: school.logoUrl, cid: 'school-logo' }] : []),
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

module.exports = { notifyPaymentReceipt, notifyBillEmail, notifyBillsEmailed };
