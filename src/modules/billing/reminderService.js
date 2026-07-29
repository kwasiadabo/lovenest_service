const { Op } = require('sequelize');
const { School, Term, SchoolStatusEvent } = require('../../models');
const { sendSms } = require('../../utils/sms');
const { sendMail } = require('../../utils/mailer');
const {
  isTermSettled, handleTermIndebtedness, platformSmsSenderId, platformEmailCreds,
} = require('./termBillingService');

const DAY_MS = 24 * 60 * 60 * 1000;

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
//
// subscriptionExpiresAt now doubles as "days left" for the 14-day/3-day
// pre-expiry nudges below regardless of whether it was set from a term's
// endDate (active schools, termly billing) or a trial's duration (trial
// schools) — daysLeft() doesn't need to know which.
//
// What happens once expiry actually passes differs by status:
//  - trial: unchanged — a free, time-boxed evaluation with no grace period.
//    Immediate, unconditional auto-suspend.
//  - active: termly billing's grace period applies (see
//    billing/termBillingService.js) — the current term ending unpaid first
//    prompts the tenant + starts a 14-day grace clock, and only auto-
//    suspends once that clock has elapsed with the term still unpaid.
async function runSubscriptionReminderSweep() {
  const schools = await School.findAll({
    where: {
      status: { [Op.in]: ['trial', 'active'] },
      subscriptionExpiresAt: { [Op.ne]: null },
    },
  });

  const results = {
    reminder14: 0, reminder3: 0, suspended: 0, termSuspended: 0, errors: 0,
  };

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

      if (school.status === 'trial') {
        // Unconditional on the date alone, same as before termly billing —
        // trial has no grace period.
        if (new Date(school.subscriptionExpiresAt).getTime() <= Date.now()) {
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
      } else {
        // school.status === 'active'
        // eslint-disable-next-line no-await-in-loop
        const currentTerm = await Term.findOne({ where: { schoolId: school.id, isCurrent: true } });
        if (currentTerm && new Date(currentTerm.endDate).getTime() < Date.now()) {
          // eslint-disable-next-line no-await-in-loop
          const settled = await isTermSettled(school.id, currentTerm.id);
          if (!settled) {
            // Idempotent — safe to call every tick. Prompts the tenant
            // (in-app + SMS/email) and starts the 14-day grace clock the
            // first time it's called for this debt; a no-op after that.
            // eslint-disable-next-line no-await-in-loop
            await handleTermIndebtedness(school.id, currentTerm);

            // eslint-disable-next-line no-await-in-loop
            const refreshed = await School.findByPk(school.id);
            if (
              refreshed.termGraceEndsAt
              && new Date(refreshed.termGraceEndsAt).getTime() <= Date.now()
            ) {
              const previousStatus = refreshed.status;
              refreshed.status = 'suspended';
              refreshed.statusReason = 'term_non_payment_auto';
              refreshed.statusChangedAt = new Date();
              refreshed.statusChangedByUserId = null;
              // eslint-disable-next-line no-await-in-loop
              await refreshed.save();
              // eslint-disable-next-line no-await-in-loop
              await SchoolStatusEvent.create({
                schoolId: school.id,
                actorUserId: null,
                action: 'auto_suspended_term_non_payment',
                previousStatus,
                newStatus: 'suspended',
              });
              results.termSuspended += 1;
            }
          }
        }
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
