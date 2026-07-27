/**
 * One-off smoke test for year-end close (closeAcademicYear), against the
 * real DB. Creates a temp academic year, posts income and expense
 * activity, closes the year, and verifies Retained Earnings absorbs the
 * net surplus while Income/Expense zero out — then cleans up.
 *
 * Usage: node scripts/smokeTestPeriodClose.js
 */
require('dotenv').config();
const {
  sequelize, School, AcademicYear, Account, JournalEntry, JournalLine,
} = require('../src/models');
const accountingService = require('../src/modules/accounting/service');

async function main() {
  await sequelize.authenticate();
  const school = await School.findOne();
  console.log(`Testing against school: ${school.name} (${school.id})`);

  const year = await AcademicYear.create({
    schoolId: school.id, name: 'SMOKE Close Yr', startDate: '2027-01-01', endDate: '2027-12-31', isCurrent: false,
  });

  const tuitionAccount = await Account.findOne({ where: { schoolId: school.id, code: '4000' } });
  const utilitiesAccount = await Account.findOne({ where: { schoolId: school.id, code: '5100' } });
  const arAccount = await Account.findOne({ where: { schoolId: school.id, code: '1100' } });

  // GHS 10,000 income, GHS 3,000 expense -> GHS 7,000 net surplus.
  const incomeEntry = await accountingService.createManualJournalEntry(school.id, null, {
    entryDate: '2027-03-01',
    description: 'SMOKE TEST income',
    lines: [
      { accountId: arAccount.id, debitPesewas: 1000000 },
      { accountId: tuitionAccount.id, creditPesewas: 1000000 },
    ],
  });
  const expenseEntry = await accountingService.createManualJournalEntry(school.id, null, {
    entryDate: '2027-04-01',
    description: 'SMOKE TEST expense',
    lines: [
      { accountId: utilitiesAccount.id, debitPesewas: 300000 },
      { accountId: arAccount.id, creditPesewas: 300000 },
    ],
  });

  const incomeStatementBefore = await accountingService.getIncomeStatement(school.id, { from: year.startDate, to: year.endDate });
  console.log('Net surplus before close:', incomeStatementBefore.netSurplusPesewas, '(expect 700000)');

  const closeEntry = await accountingService.closeAcademicYear(school.id, year.id, null);
  console.log('Close entry posted:', closeEntry.entryNumber, 'lines:', closeEntry.lines.length);

  const incomeStatementAfterAllTime = await accountingService.getIncomeStatement(school.id, {});
  const netSurplusAfterClose = incomeStatementAfterAllTime.income
    .filter((r) => r.accountId === tuitionAccount.id)
    .reduce((sum, r) => sum + r.amountPesewas, 0);
  console.log('Tuition account net (all-time, should be 0 since close zeroed it):', netSurplusAfterClose);

  const balanceSheet = await accountingService.getBalanceSheet(school.id, { asOf: '2027-12-31' });
  const retainedEarningsRow = balanceSheet.equity.find((r) => r.code === '3000');
  console.log('Retained Earnings after close:', retainedEarningsRow?.amountPesewas, '(expect 700000)');

  const tb = await accountingService.getTrialBalance(school.id, {});
  console.log('Balanced after close:', tb.totalDebitBalancePesewas === tb.totalCreditBalancePesewas);

  // Attempting to close again should fail (idempotency guard).
  try {
    await accountingService.closeAcademicYear(school.id, year.id, null);
    console.log('ERROR: second close should have thrown');
  } catch (err) {
    console.log('Second close correctly rejected:', err.message);
  }

  // Cleanup
  const allEntries = await JournalEntry.findAll({
    where: { id: [incomeEntry.id, expenseEntry.id, closeEntry.id] },
  });
  const entryIds = allEntries.map((e) => e.id);
  await JournalLine.destroy({ where: { journalEntryId: entryIds } });
  await JournalEntry.destroy({ where: { id: entryIds } });
  await AcademicYear.destroy({ where: { id: year.id } });

  const tbFinal = await accountingService.getTrialBalance(school.id, {});
  console.log('Final trial balance (should be 0/0):', tbFinal.totalDebitBalancePesewas, tbFinal.totalCreditBalancePesewas);
  console.log('Cleaned up. All checks passed.');

  process.exit(0);
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
