const fs = require('fs');
const path = require('path');
const { StudentParent, Parent } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const { sendMail } = require('../../utils/mailer');
const { sendSms } = require('../../utils/sms');
const { decryptSecret } = require('../../utils/secretCrypto');

const PROSPECTUS_PATH = path.join(__dirname, '../../assets/preschool-prospectus.pdf');
// Read once and reused across every send — this is a fixed document bundled
// with the app, not per-school content, so there's nothing to invalidate.
let prospectusBuffer = null;
function loadProspectusBuffer() {
  if (!prospectusBuffer) prospectusBuffer = fs.readFileSync(PROSPECTUS_PATH);
  return prospectusBuffer;
}

async function getStudentParents(schoolId, studentId) {
  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId },
    include: [Parent],
  });
  const byId = new Map(links.map((l) => [l.Parent.id, l.Parent]));
  return [...byId.values()];
}

function prospectusEmailHtml({ school, student }) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b;">
      ${school?.logoUrl ? '<img src="cid:school-logo" alt="School logo" style="height:48px;margin-bottom:12px;" />' : ''}
      <h2 style="margin-bottom:4px;">${school?.name || 'School'}</h2>
      <p>Dear Parent/Guardian,</p>
      <p>
        Congratulations — <strong>${student.fullName}</strong>'s admission to Pre-school is now complete.
      </p>
      <p>Attached is the Pre-school prospectus, listing what your ward should bring along each day.</p>
      <p>Thank you.</p>
    </div>
  `;
}

// Best-effort, same shape/contract as financials/notify.js#notifyPaymentReceipt
// — a bad email or missing address for one parent must never affect another
// parent's send, or the admission payment that triggered this.
async function notifyPreschoolProspectus(schoolId, { school, student }) {
  const summary = { email: { attempted: 0, sent: 0, failed: 0 } };
  const parents = await getStudentParents(schoolId, student.id);
  const parentsWithEmail = parents.filter((p) => p.email);
  if (parentsWithEmail.length === 0) return summary;

  const emailAppPassword = decryptSecret(school?.emailAppPasswordEncrypted);
  const pdfBuffer = loadProspectusBuffer();

  const results = await Promise.all(parentsWithEmail.map((parent) => sendMail({
    to: parent.email,
    subject: `Pre-school prospectus — ${student.fullName}`,
    html: prospectusEmailHtml({ school, student }),
    attachments: [
      { filename: 'preschool-prospectus.pdf', content: pdfBuffer },
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

function loginCredentialsSmsMessage({ school, parent, password, isReset }) {
  const schoolName = school?.name || 'School';
  const action = isReset ? 'password has been reset' : 'parent portal login is ready';
  return `${schoolName}: Your ${action}. Email: ${parent.email}  Password: ${password}. `
    + "You'll be asked to set a new password when you log in — keep it private.";
}

// Same visual convention as prospectusEmailHtml above (logo via cid, plain
// <h2> school name) plus a highlighted credentials block, since this is the
// one email in the app that has to carry a password rather than just
// informational content.
function loginCredentialsEmailHtml({ school, parent, password, isReset }) {
  const schoolName = school?.name || 'School';
  const intro = isReset
    ? `Your ${schoolName} parent portal password has been reset by the school office.`
    : `A parent portal login has been created for you at ${schoolName}.`;
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b;">
      ${school?.logoUrl ? '<img src="cid:school-logo" alt="School logo" style="height:48px;margin-bottom:12px;" />' : ''}
      <h2 style="margin-bottom:4px;">${schoolName}</h2>
      <p>Dear ${parent.fullName || 'Parent/Guardian'},</p>
      <p>${intro}</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 4px;"><strong>Email:</strong> ${parent.email}</p>
        <p style="margin:0;"><strong>Temporary password:</strong> ${password}</p>
      </div>
      <p>
        For your security, you'll be asked to choose a new password the first time you log in.
        Please keep your password private and do not share it with anyone.
      </p>
      <p>If you did not expect this ${isReset ? 'password reset' : 'login'}, please contact the school office.</p>
      <p>Thank you.</p>
    </div>
  `;
}

// Best-effort, same contract as notifyPreschoolProspectus — a failed SMS or
// email must never fail the login creation/reset that already happened
// (the caller still has the plaintext password to fall back to manually).
// Sends both channels in parallel rather than one-then-the-other, same as
// financials/notify.js#notifyPaymentReceipt.
async function notifyParentLoginCredentials(schoolId, {
  school, parent, password, isReset,
}) {
  const summary = { sms: null, email: null };

  const smsTask = parent.phone
    ? sendSms({
      to: parent.phone,
      message: loginCredentialsSmsMessage({
        school, parent, password, isReset,
      }),
      senderId: school?.smsSenderId,
      schoolId,
    }).then((r) => { summary.sms = r; })
    : Promise.resolve();

  const emailTask = parent.email
    ? sendMail({
      to: parent.email,
      subject: isReset
        ? `Your ${school?.name || 'school'} parent portal password has been reset`
        : `Your ${school?.name || 'school'} parent portal login`,
      html: loginCredentialsEmailHtml({
        school, parent, password, isReset,
      }),
      attachments: school?.logoUrl ? [{ filename: 'logo.png', path: school.logoUrl, cid: 'school-logo' }] : undefined,
      emailUser: school?.emailUser,
      emailAppPassword: decryptSecret(school?.emailAppPasswordEncrypted),
      fromName: school?.name,
    }).then((r) => { summary.email = r; })
    : Promise.resolve();

  await Promise.all([smsTask, emailTask]);
  return summary;
}

module.exports = { notifyPreschoolProspectus, notifyParentLoginCredentials };
