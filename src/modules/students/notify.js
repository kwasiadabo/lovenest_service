const fs = require('fs');
const path = require('path');
const { StudentParent, Parent } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const { sendMail } = require('../../utils/mailer');
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

module.exports = { notifyPreschoolProspectus };
