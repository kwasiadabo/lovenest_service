const { Op } = require('sequelize');
const {
  School, Class, FeeType,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const notificationsService = require('../notifications/service');
const financialsService = require('./service');

// True on the last calendar day of the month for `date` (default: today) —
// node-cron has no native "last day of month" trigger, so the caller (see
// jobs/scheduler.js) runs this check daily and only proceeds when it's true.
function isLastDayOfMonth(date = new Date()) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

// Next calendar month/year relative to `date` (default: today) — "bills for
// next month, generated at the end of this month," per the plan this
// scheduler implements.
function nextMonthYear(date = new Date()) {
  const month = date.getMonth() + 1; // 0-11 -> 1-12
  if (month === 12) return { month: 1, year: date.getFullYear() + 1 };
  return { month: month + 1, year: date.getFullYear() };
}

async function billMonthlySchoolClasses(schoolId, { month, year }) {
  const monthlyClasses = await tenantScoped(Class, schoolId).findAll({
    where: { feeBillingCycle: 'MONTHLY' },
  });
  if (monthlyClasses.length === 0) return null;

  // Every non-admission fee item — whichever ones actually have a monthly
  // rate configured for a given class get billed (resolveAmount just skips
  // the rest), same "pass everything, let amount-resolution filter" shape
  // BillingWorkspace's admin-driven flow already uses.
  const feeTypes = await tenantScoped(FeeType, schoolId).findAll({
    where: { category: { [Op.ne]: 'ADMISSION' } },
  });
  if (feeTypes.length === 0) return null;

  const result = await financialsService.generateBills(schoolId, null, {
    billingCycle: 'MONTHLY',
    month,
    year,
    targetType: 'CLASS',
    targetIds: monthlyClasses.map((c) => c.id),
    feeTypeIds: feeTypes.map((ft) => ft.id),
  });

  if (result.billsCreated > 0 || result.billsUpdated > 0) {
    await notificationsService.notifyRoles(schoolId, ['SCHOOL_ADMIN', 'ACCOUNTANT'], {
      type: 'monthly_bills_ready',
      title: 'Next month\'s bills are ready to review',
      body: `${result.billsCreated} new bill(s) and ${result.billsUpdated} updated bill(s) were generated for `
        + 'next month\'s monthly-billing classes. Review and confirm them under Financials → Billing.',
      linkUrl: '/admin/financials/billing',
    });
  }

  return result;
}

// Runs daily (see jobs/scheduler.js) but only does anything on the last day
// of the month, generating next month's PROVISIONAL bills for every school
// that has at least one MONTHLY-billing class (typically pre-school). Never
// auto-confirms — see the plan this implements: a tuition bill has several
// negotiable line items (unlike a single-rate transport invoice), so an
// admin reviews and confirms it, same as the existing manual flow.
// `force` skips the last-day-of-month gate — used only by the SUPER_ADMIN
// on-demand test route (POST /api/platform/monthly-billing/run-now), so
// this can be verified without waiting for month-end.
async function runMonthlyBillingSweep(date = new Date(), { force = false } = {}) {
  if (!force && !isLastDayOfMonth(date)) return { skipped: true, reason: 'not the last day of the month' };

  const { month, year } = nextMonthYear(date);
  const schools = await School.findAll({ attributes: ['id'] });

  const outcomes = await Promise.allSettled(
    schools.map((school) => billMonthlySchoolClasses(school.id, { month, year })),
  );

  const errors = [];
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'rejected') {
      errors.push({ schoolId: schools[index].id, error: outcome.reason?.message || String(outcome.reason) });
    }
  });

  return {
    skipped: false, month, year, schoolsChecked: schools.length, errors,
  };
}

module.exports = {
  isLastDayOfMonth, nextMonthYear, runMonthlyBillingSweep,
};
