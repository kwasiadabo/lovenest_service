const {
  School, Payment, SchoolStatusEvent,
} = require('../../models');
const { SCHOOL_SAFE_ATTRIBUTES } = require('../../utils/schoolSafeQuery');
const { notifyRoles } = require('../notifications/service');
const { sendSms } = require('../../utils/sms');
const { sendMail } = require('../../utils/mailer');

const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;
const PROMPT_ROLES = ['SCHOOL_ADMIN', 'HEAD_TEACHER'];

// Platform-level contact identity — same rationale as
// reminderService.js's original copy of these two functions (now sourced
// from here instead, so both files share one lookup): a pending/trial/
// suspended school may not have its own smsSenderId/emailUser configured
// yet, and this is the platform reaching out to the tenant, not the tenant
// messaging its own parents.
function platformSmsSenderId() {
  return process.env.PLATFORM_SMS_SENDER_ID;
}

function platformEmailCreds() {
  return {
    emailUser: process.env.PLATFORM_EMAIL_USER,
    emailAppPassword: process.env.PLATFORM_EMAIL_APP_PASSWORD,
  };
}

async function isTermSettled(schoolId, termId) {
  if (!termId) return false;
  const count = await Payment.count({ where: { schoolId, termId, status: 'success' } });
  return count > 0;
}

async function sendTermPaymentPrompt(school, term) {
  const message = `Dear ${school.name}, ${term.name} has ended and payment has not been `
    + 'received. Please pay within 14 days to avoid your account being suspended.';
  const tasks = [];

  if (school.phone) {
    tasks.push(sendSms({ to: school.phone, message, senderId: platformSmsSenderId() }));
  }
  if (school.email) {
    const { emailUser, emailAppPassword } = platformEmailCreds();
    tasks.push(sendMail({
      to: school.email,
      subject: `Payment due — ${term.name} has ended`,
      html: `<p>${message}</p>`,
      emailUser,
      emailAppPassword,
      fromName: 'VX-School',
    }));
  }

  // Best-effort, same convention as reminderService.js's sendReminder — a
  // failed send must not stop the caller from moving on.
  await Promise.allSettled(tasks);
}

// The single point where "term ended/vacated + unpaid" becomes a prompt +
// (idempotent) grace-clock start. Callable both from academic/service.js's
// setCurrentTerm/setCurrentAcademicYear (term is the just-vacated one) and
// from reminderService.js's daily sweep (term is the still-current,
// now-overdue one). Never throws to the caller — a failure here must not
// block a set-current transition or abort the cron sweep for other schools.
async function handleTermIndebtedness(schoolId, term) {
  if (!term) return null; // no term configured yet — nothing to check

  const settled = await isTermSettled(schoolId, term.id);
  if (settled) return null;

  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  if (!school || school.status === 'suspended') return null; // already locked out

  let changed = false;

  if (!school.termPaymentPromptSentAt) {
    await notifyRoles(schoolId, PROMPT_ROLES, {
      type: 'billing_term_payment_due',
      title: `Payment due for ${term.name}`,
      body: `${term.name} has ended and payment has not been received yet. `
        + 'You have 14 days to pay before access is suspended.',
      linkUrl: '/billing',
    });
    await sendTermPaymentPrompt(school, term);
    school.termPaymentPromptSentAt = new Date();
    changed = true;
  }

  if (!school.termGraceEndsAt) {
    school.termGraceEndsAt = new Date(Date.now() + GRACE_PERIOD_MS);
    changed = true;
  }

  if (changed) {
    await school.save();
    await SchoolStatusEvent.create({
      schoolId,
      actorUserId: null, // system-triggered side effect, not an admin's punitive action
      action: 'term_payment_grace_started',
      note: `${term.name} ended unpaid — grace period until ${school.termGraceEndsAt.toISOString()}`,
    });
  }

  return school;
}

module.exports = {
  GRACE_PERIOD_MS,
  isTermSettled,
  handleTermIndebtedness,
  platformSmsSenderId,
  platformEmailCreds,
};
