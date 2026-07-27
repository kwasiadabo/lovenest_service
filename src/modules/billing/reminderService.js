const { Op } = require('sequelize');
const { School, SchoolStatusEvent } = require('../../models');
const { sendSms } = require('../../utils/sms');
const { sendMail } = require('../../utils/mailer');

const DAY_MS = 24 * 60 * 60 * 1000;

// Platform-level contact identity — deliberately NOT the tenant's own
// School.smsSenderId/emailUser (School model), since a pending/trial/
// suspended school may not have configured those yet, and this is the
// platform reaching out to the tenant, not the tenant messaging its own
// parents. See .env.example for setup notes.
function platformSmsSenderId() {
  return process.env.PLATFORM_SMS_SENDER_ID;
}

function platformEmailCreds() {
  return {
    emailUser: process.env.PLATFORM_EMAIL_USER,
    emailAppPassword: process.env.PLATFORM_EMAIL_APP_PASSWORD,
  };
}

function daysLeft(expiresAt) {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS);
}

function reminderMessage(school, remainingDays) {
  return `Dear ${school.name}, your VX-School subscription expires in ${remainingDays} day`
    + `${remainingDays === 1 ? '' : 's'}. Please renew to avoid your account being suspended.`;
}

async function sendReminder(school, remainingDays) {
  const message = reminderMessage(school, remainingDays);
  const tasks = [];

  if (school.phone) {
    tasks.push(sendSms({ to: school.phone, message, senderId: platformSmsSenderId() }));
  }
  if (school.email) {
    const { emailUser, emailAppPassword } = platformEmailCreds();
    tasks.push(sendMail({
      to: school.email,
      subject: 'Your VX-School subscription is expiring soon',
      html: `<p>${message}</p>`,
      emailUser,
      emailAppPassword,
      fromName: 'VX-School',
    }));
  }

  // Best-effort, same as every other notify.js in this codebase — a failed
  // send must not stop the sweep from moving on to the next school, and the
  // 14-day/3-day flags are still set below regardless of delivery success
  // (matches decision 3: auto-suspend at expiry is unconditional on whether
  // reminders actually reached anyone).
  await Promise.allSettled(tasks);
}

// Runs daily (see jobs/scheduler.js) — also exposed as a SUPER_ADMIN-only
// on-demand endpoint (platform/routes.js POST /reminders/run-now) for
// testing without waiting for the cron tick.
async function runSubscriptionReminderSweep() {
  const schools = await School.findAll({
    where: {
      status: { [Op.in]: ['trial', 'active'] },
      subscriptionExpiresAt: { [Op.ne]: null },
    },
  });

  const results = { reminder14: 0, reminder3: 0, suspended: 0, errors: 0 };

  for (const school of schools) {
    // eslint-disable-next-line no-await-in-loop
    try {
      const remaining = daysLeft(school.subscriptionExpiresAt);

      if (remaining <= 14 && !school.reminder14SentAt) {
        // eslint-disable-next-line no-await-in-loop
        await sendReminder(school, remaining);
        school.reminder14SentAt = new Date();
        // eslint-disable-next-line no-await-in-loop
        await school.save();
        // eslint-disable-next-line no-await-in-loop
        await SchoolStatusEvent.create({
          schoolId: school.id, actorUserId: null, action: 'reminder_sent_14d',
        });
        results.reminder14 += 1;
      }

      if (remaining <= 3 && !school.reminder3SentAt) {
        // eslint-disable-next-line no-await-in-loop
        await sendReminder(school, remaining);
        school.reminder3SentAt = new Date();
        // eslint-disable-next-line no-await-in-loop
        await school.save();
        // eslint-disable-next-line no-await-in-loop
        await SchoolStatusEvent.create({
          schoolId: school.id, actorUserId: null, action: 'reminder_sent_3d',
        });
        results.reminder3 += 1;
      }

      // Unconditional on the date alone — a safety net independent of
      // whether either reminder above was ever successfully sent.
      if (new Date(school.subscriptionExpiresAt).getTime() <= Date.now() && school.status !== 'suspended') {
        const previousStatus = school.status;
        school.status = 'suspended';
        school.statusReason = 'non_payment_auto';
        school.statusChangedAt = new Date();
        school.statusChangedByUserId = null;
        // eslint-disable-next-line no-await-in-loop
        await school.save();
        // eslint-disable-next-line no-await-in-loop
        await SchoolStatusEvent.create({
          schoolId: school.id,
          actorUserId: null,
          action: 'auto_suspended_non_payment',
          previousStatus,
          newStatus: 'suspended',
        });
        results.suspended += 1;
      }
    } catch (err) {
      // One bad school (malformed contact info, etc.) must not abort the
      // sweep for every other school.
      results.errors += 1;
    }
  }

  return results;
}

module.exports = { runSubscriptionReminderSweep };
