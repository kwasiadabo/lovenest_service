/**
 * One-off smoke test for the Budgeting flow (create budget -> approve ->
 * budget-vs-actual), against the real DB. Creates a temp academic year and
 * posts a journal entry to compare against the budget line, then cleans up.
 *
 * Usage: node scripts/smokeTestBudgeting.js
 */
require('dotenv').config();
const {
  sequelize, School, AcademicYear, Account, Budget, BudgetLine, JournalEntry, JournalLine,
} = require('../src/models');
const budgetingService = require('../src/modules/budgeting/service');
const accountingService = require('../src/modules/accounting/service');

async function main() {
  await sequelize.authenticate();
  const school = await School.findOne();
  console.log(`Testing against school: ${school.name} (${school.id})`);

  const year = await AcademicYear.create({
    schoolId: school.id, name: 'SMOKE TEST Year', startDate: '2026-01-01', endDate: '2026-12-31', isCurrent: false,
  });

  const utilitiesAccount = await Account.findOne({ where: { schoolId: school.id, code: '5100' } });

  let budget = await budgetingService.createBudget(school.id, null, {
    academicYearId: year.id,
    name: 'SMOKE TEST Budget',
    lines: [{ accountId: utilitiesAccount.id, budgetedAmountPesewas: 500000 }], // GHS 5,000 budgeted
  });
  console.log('Budget created with', budget.lines.length, 'line(s)');

  budget = await budgetingService.approveBudget(school.id, budget.id, null);
  console.log('Approved. status:', budget.status);

  // Post GHS 2,000 of actual utilities spend within the budget year.
  const entry = await accountingService.createManualJournalEntry(school.id, null, {
    entryDate: '2026-06-15',
    description: 'SMOKE TEST utilities spend',
    lines: [
      { accountId: utilitiesAccount.id, debitPesewas: 200000 },
      { accountCode: '3010', creditPesewas: 200000 },
    ],
  });

  const vsActual = await budgetingService.getBudgetVsActual(school.id, budget.id);
  console.log(
    'Budgeted:', vsActual.totalBudgetedPesewas, '(expect 500000) | Actual:', vsActual.totalActualPesewas,
    '(expect 200000) | Variance:', vsActual.rows[0].variancePesewas, '(expect 300000)',
  );

  // Cleanup
  await JournalLine.destroy({ where: { journalEntryId: entry.id } });
  await JournalEntry.destroy({ where: { id: entry.id } });
  await BudgetLine.destroy({ where: { budgetId: budget.id } });
  await Budget.destroy({ where: { id: budget.id } });
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
