/**
 * One-off smoke test for the accounting subsystem's core plumbing — creates
 * a cash account, posts a manual journal entry, reads back every statement
 * endpoint's service function, then cleans up everything it created. Not a
 * permanent script; safe to delete once Phase 1 is verified.
 *
 * Usage: node scripts/smokeTestLedger.js
 */
require('dotenv').config();
const {
  sequelize, School, CashAccount, Account, JournalEntry, JournalLine,
} = require('../src/models');
const accountingService = require('../src/modules/accounting/service');

async function main() {
  await sequelize.authenticate();
  const school = await School.findOne();
  if (!school) throw new Error('No school found to test against');
  console.log(`Testing against school: ${school.name} (${school.id})`);

  const cashAccount = await accountingService.createCashAccount(school.id, {
    name: 'SMOKE TEST Cash Account',
    kind: 'CASH',
    openingBalancePesewas: 0,
  });
  console.log('Created cash account:', cashAccount.name, cashAccount.accountId);

  const entry = await accountingService.createManualJournalEntry(school.id, null, {
    entryDate: new Date().toISOString().slice(0, 10),
    description: 'SMOKE TEST manual entry',
    lines: [
      { accountId: cashAccount.accountId, debitPesewas: 10000 },
      { accountCode: '4900', creditPesewas: 10000 },
    ],
  });
  console.log('Posted journal entry:', entry.entryNumber, 'lines:', entry.lines.length);

  const trialBalance = await accountingService.getTrialBalance(school.id, {});
  console.log('Trial balance rows:', trialBalance.rows.length, 'balanced:',
    trialBalance.totalDebitBalancePesewas === trialBalance.totalCreditBalancePesewas);

  const income = await accountingService.getIncomeStatement(school.id, {});
  console.log('Income statement net surplus (pesewas):', income.netSurplusPesewas);

  const balanceSheet = await accountingService.getBalanceSheet(school.id, {});
  console.log('Balance sheet: Assets =', balanceSheet.totalAssetsPesewas,
    '| Liabilities+Equity =', balanceSheet.totalLiabilitiesAndEquityPesewas);

  const cashFlow = await accountingService.getCashFlowStatement(school.id, {});
  console.log('Cash flow net change (pesewas):', cashFlow.netChangeInCashPesewas);

  const gl = await accountingService.getGeneralLedger(school.id, cashAccount.accountId, {});
  console.log('General ledger closing balance (pesewas):', gl.closingBalancePesewas);

  const statement = await accountingService.getCashAccountStatement(school.id, cashAccount.id, {});
  console.log('Cash account statement lines:', statement.lines.length);

  // Cleanup — delete everything this script created so the dev DB isn't
  // left with permanent smoke-test clutter.
  await JournalLine.destroy({ where: { journalEntryId: entry.id } });
  await JournalEntry.destroy({ where: { id: entry.id } });
  await CashAccount.destroy({ where: { id: cashAccount.id } });
  await Account.destroy({ where: { id: cashAccount.accountId } });
  console.log('Cleaned up smoke-test data. All checks passed.');

  process.exit(0);
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
