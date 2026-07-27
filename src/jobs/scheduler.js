const cron = require('node-cron');
const { runSubscriptionReminderSweep } = require('../modules/billing/reminderService');
const { runDailyRegisterReminderSweep } = require('../modules/attendance/service');

// Daily at 07:00 Accra time — reminds tenants 14/3 days before expiry and
// auto-suspends anyone still unpaid past their expiry date. See
// billing/reminderService.js. Also reachable on demand via the SUPER_ADMIN
// POST /api/platform/reminders/run-now route, for testing.
function startScheduler() {
  cron.schedule('0 7 * * *', () => {
    runSubscriptionReminderSweep().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] subscription reminder sweep failed:', err);
    });
  }, { timezone: 'Africa/Accra' });

  // Weekdays at 10:00 Accra time — a mid-morning cutoff, late enough that a
  // class teacher has had time to take the register but early enough that
  // reminding them still helps that day. Mon-Fri only, since there's no
  // school-calendar/holiday model to know which weekdays are actually in
  // session (see attendance/service.js#runDailyRegisterReminderSweep).
  cron.schedule('0 10 * * 1-5', () => {
    runDailyRegisterReminderSweep().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] attendance register reminder sweep failed:', err);
    });
  }, { timezone: 'Africa/Accra' });
}

module.exports = { startScheduler };
