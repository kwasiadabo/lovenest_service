const cron = require('node-cron');
const { runDailyRegisterReminderSweep } = require('../modules/attendance/service');
const { runMonthlyBillingSweep } = require('../modules/financials/monthlyBillingScheduler');
const { runMissedPickupSweep } = require('../modules/gateLog/service');

function startScheduler() {
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

  // Daily at 06:00 Accra time — a no-op most days; only does real work on
  // the last day of the month (node-cron has no native "last day of month"
  // trigger, see monthlyBillingScheduler.js#isLastDayOfMonth), when it
  // generates next month's PROVISIONAL bills for every MONTHLY-billing
  // class (typically pre-school) and notifies admins to review/confirm them.
  cron.schedule('0 6 * * *', () => {
    runMonthlyBillingSweep().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] monthly billing sweep failed:', err);
    });
  }, { timezone: 'Africa/Accra' });

  // Every 15 min, 11:00–19:00 Accra time, Mon-Fri — broad enough to cover any
  // school's own dismissal time (gateLogDismissalTime is per-school, not a
  // fixed cutoff like the attendance reminder's 10am).
  cron.schedule('*/15 11-19 * * 1-5', () => {
    runMissedPickupSweep().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] gate log missed-pickup sweep failed:', err);
    });
  }, { timezone: 'Africa/Accra' });
}

module.exports = { startScheduler };
