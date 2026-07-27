/**
 * One-off smoke test for the Accounts Payable flow (expense approve ->
 * mark paid -> AP aging), against the real DB. Creates a temp approver
 * user, an expense item, and an expense request, then cleans everything up.
 *
 * Usage: node scripts/smokeTestExpensePayable.js
 */
require('dotenv').config();
const {
  sequelize, School, User, ExpenseItem, ExpenseRequest, CashAccount, Account, JournalEntry, JournalLine,
} = require('../src/models');
const expensesService = require('../src/modules/expenses/service');
const accountingService = require('../src/modules/accounting/service');

async function main() {
  await sequelize.authenticate();
  const school = await School.findOne();
  console.log(`Testing against school: ${school.name} (${school.id})`);

  const requester = await User.findOne({ where: { schoolId: school.id } });
  const approver = await User.create({
    schoolId: school.id,
    email: `smoke-test-approver-${Date.now()}@example.com`,
    passwordHash: 'not-a-real-hash',
    fullName: 'SMOKE TEST Approver',
  });

  const expenseItem = await ExpenseItem.create({ schoolId: school.id, name: 'SMOKE TEST Item', category: 'SUPPLIES' });
  const cashAccount = await accountingService.createCashAccount(school.id, { name: 'SMOKE TEST Expense Cash', kind: 'CASH' });

  let request = await expensesService.createExpenseRequest(school.id, requester.id, {
    expenseItemId: expenseItem.id,
    amountPesewas: 5000,
    description: 'SMOKE TEST expense request',
    expenseDate: new Date().toISOString().slice(0, 10),
  });
  console.log('Created expense request, status:', request.status);

  request = await expensesService.approveExpenseRequest(school.id, request.id, approver.id);
  console.log('Approved. status:', request.status, 'paymentStatus:', request.paymentStatus);

  const apAgingBefore = await accountingService.getApAging(school.id);
  const found = apAgingBefore.rows.find((r) => r.id === request.id);
  console.log('AP aging shows outstanding row:', !!found, found?.bucket);

  request = await expensesService.markExpenseRequestPaid(school.id, request.id, approver.id, {
    paymentMethod: 'CASH',
    paidDate: new Date().toISOString().slice(0, 10),
    cashAccountId: cashAccount.id,
  });
  console.log('Marked paid. paymentStatus:', request.paymentStatus);

  const apAgingAfter = await accountingService.getApAging(school.id);
  const stillThere = apAgingAfter.rows.find((r) => r.id === request.id);
  console.log('AP aging no longer shows it after payment:', !stillThere);

  const trialBalance = await accountingService.getTrialBalance(school.id, {});
  console.log('Trial balance still balances:', trialBalance.totalDebitBalancePesewas === trialBalance.totalCreditBalancePesewas);

  // Cleanup — delete every journal entry/line this run touched (approval,
  // payment, and deleteExpenseRequest's two reversals) before removing the
  // rows they reference, since journal_lines/journal_entries FK to
  // accounts/users with NO ACTION (never CASCADE).
  await expensesService.deleteExpenseRequest(school.id, request.id, approver.id, true);
  const orphanedEntries = await JournalEntry.findAll({ where: { createdByUserId: approver.id } });
  const orphanedEntryIds = orphanedEntries.map((e) => e.id);
  await JournalLine.destroy({ where: { journalEntryId: orphanedEntryIds } });
  await JournalEntry.destroy({ where: { id: orphanedEntryIds } });
  await ExpenseItem.destroy({ where: { id: expenseItem.id } });
  await CashAccount.destroy({ where: { id: cashAccount.id } });
  await Account.destroy({ where: { id: cashAccount.accountId } });
  await User.destroy({ where: { id: approver.id } });
  console.log('Cleaned up. All checks passed.');

  process.exit(0);
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
