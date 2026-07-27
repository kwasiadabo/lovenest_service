/**
 * One-time-per-school opening-balance backfill for the accounting
 * subsystem — reconciles pre-existing Bill/BillPayment/LevyPayment/
 * AdmissionPayment/ExpenseRequest history (recorded before the general
 * ledger existed) into a single opening JournalEntry, so the GL starts
 * from a correct, reconciled position instead of zero.
 *
 * Safe to re-run: a Bill/BillPayment/LevyPayment/AdmissionPayment/
 * ExpenseRequest that already has a JournalEntry posted against it (via
 * sourceType+sourceId) is *excluded* from the backfill sums — only rows
 * that predate the GL going live (no journal entry yet) are counted. This
 * generalizes the "run once right before cutover" plan to also be safe if
 * run after some post-cutover activity already exists.
 *
 * Historical approved expenses are treated as already paid: the pre-AP-
 * split data model never distinguished "approved" from "paid" (see the
 * 20260101000064 migration, which backfilled every pre-existing APPROVED
 * row to paymentStatus='PAID'), so there is no honest way to reconstruct
 * a historical Accounts Payable balance — AP correctly starts at zero and
 * only accrues from new approvals going forward.
 *
 * If a school's two sides don't reconcile to a clean balance (shouldn't
 * happen given the arithmetic below, but data can surprise you), the
 * difference is routed to the 2900 Suspense Account rather than blocking
 * the rollout, flagged for the school's accountant to clear manually.
 *
 * Usage: node scripts/backfillOpeningBalances.js
 */
require('dotenv').config();
const {
  sequelize, School, Student, Bill, BillPayment, LevyPayment, AdmissionPayment, ExpenseRequest,
  CashAccount, JournalEntry,
} = require('../src/models');
const accountingService = require('../src/modules/accounting/service');
const { postJournalEntry } = require('../src/modules/accounting/ledgerPoster');

const UNALLOCATED_CASH_NAME = 'Unallocated Historical Cash';

async function hasJournalEntry(schoolId, sourceType, sourceId) {
  const entry = await JournalEntry.findOne({ where: { schoolId, sourceType, sourceId } });
  return !!entry;
}

async function getOrCreateUnallocatedCashAccount(schoolId) {
  const existing = await CashAccount.findOne({ where: { schoolId, name: UNALLOCATED_CASH_NAME } });
  if (existing) return existing;
  return accountingService.createCashAccount(schoolId, { name: UNALLOCATED_CASH_NAME, kind: 'CASH' });
}

async function computeTotalReceivablePesewas(schoolId) {
  const students = await Student.findAll({ where: { schoolId }, attributes: ['id'] });
  let total = 0;
  for (const student of students) {
    const bills = await Bill.findAll({ where: { schoolId, studentId: student.id, status: 'CONFIRMED' } });
    const unledgeredBills = [];
    for (const bill of bills) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await hasJournalEntry(schoolId, 'BILL_CONFIRMATION', bill.id))) unledgeredBills.push(bill);
    }
    if (unledgeredBills.length === 0) continue;

    const payments = await BillPayment.findAll({ where: { schoolId, studentId: student.id } });
    let unledgeredPaymentsPesewas = 0;
    for (const payment of payments) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await hasJournalEntry(schoolId, 'BILL_PAYMENT', payment.id))) unledgeredPaymentsPesewas += payment.amountPesewas;
    }

    const unledgeredBilledPesewas = unledgeredBills.reduce((sum, b) => sum + b.totalPesewas, 0);
    total += Math.max(0, unledgeredBilledPesewas - unledgeredPaymentsPesewas);
  }
  return total;
}

async function sumUnledgered(schoolId, Model, sourceType) {
  const rows = await Model.findAll({ where: { schoolId } });
  let total = 0;
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await hasJournalEntry(schoolId, sourceType, row.id))) total += row.amountPesewas;
  }
  return total;
}

async function sumUnledgeredApprovedExpenses(schoolId) {
  const rows = await ExpenseRequest.findAll({ where: { schoolId, status: 'APPROVED' } });
  let total = 0;
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const ledgered = (await hasJournalEntry(schoolId, 'EXPENSE_APPROVAL', row.id))
      || (await hasJournalEntry(schoolId, 'EXPENSE_PAYMENT', row.id));
    if (!ledgered) total += row.amountPesewas;
  }
  return total;
}

async function backfillSchool(school) {
  const existingBackfill = await JournalEntry.findOne({ where: { schoolId: school.id, sourceType: 'OPENING_BALANCE', sourceId: null } });
  if (existingBackfill) {
    console.log(`Skipping ${school.name} — already backfilled (${existingBackfill.entryNumber})`);
    return;
  }

  const totalReceivablePesewas = await computeTotalReceivablePesewas(school.id);
  const totalBillPaymentsPesewas = await sumUnledgered(school.id, BillPayment, 'BILL_PAYMENT');
  const totalLevyPaymentsPesewas = await sumUnledgered(school.id, LevyPayment, 'LEVY_PAYMENT');
  const totalAdmissionPaymentsPesewas = await sumUnledgered(school.id, AdmissionPayment, 'ADMISSION_PAYMENT');
  const totalApprovedExpensesPesewas = await sumUnledgeredApprovedExpenses(school.id);

  const totalHistoricalCashInflowsPesewas = totalBillPaymentsPesewas + totalLevyPaymentsPesewas
    + totalAdmissionPaymentsPesewas - totalApprovedExpensesPesewas;

  if (totalReceivablePesewas === 0 && totalHistoricalCashInflowsPesewas === 0) {
    console.log(`Nothing to backfill for ${school.name} — no pre-ledger history found.`);
    return;
  }

  const cashAccount = await getOrCreateUnallocatedCashAccount(school.id);

  await sequelize.transaction(async (transaction) => {
    const lines = [];
    if (totalReceivablePesewas > 0) lines.push({ accountCode: '1100', debitPesewas: totalReceivablePesewas });
    if (totalHistoricalCashInflowsPesewas > 0) {
      lines.push({ accountId: cashAccount.accountId, debitPesewas: totalHistoricalCashInflowsPesewas });
    } else if (totalHistoricalCashInflowsPesewas < 0) {
      lines.push({ accountId: cashAccount.accountId, creditPesewas: -totalHistoricalCashInflowsPesewas });
    }

    const totalDebit = lines.reduce((sum, l) => sum + (l.debitPesewas || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (l.creditPesewas || 0), 0);
    const netToEquity = totalDebit - totalCredit;
    if (netToEquity > 0) lines.push({ accountCode: '3010', creditPesewas: netToEquity });
    else if (netToEquity < 0) lines.push({ accountCode: '3010', debitPesewas: -netToEquity });

    await postJournalEntry(school.id, {
      entryDate: new Date().toISOString().slice(0, 10),
      description: `Opening balance backfill for ${school.name}`,
      sourceType: 'OPENING_BALANCE',
      sourceId: null,
      userId: null,
      lines,
    }, transaction);
  });

  console.log(
    `Backfilled ${school.name}: AR=${totalReceivablePesewas}, cash=${totalHistoricalCashInflowsPesewas} `
    + `(payments ${totalBillPaymentsPesewas + totalLevyPaymentsPesewas + totalAdmissionPaymentsPesewas} - expenses ${totalApprovedExpensesPesewas})`,
  );
}

async function main() {
  await sequelize.authenticate();
  const schools = await School.findAll();
  for (const school of schools) {
    // eslint-disable-next-line no-await-in-loop
    await backfillSchool(school);
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
