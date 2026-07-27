/**
 * One-off smoke test for the Fixed Assets flow (purchase -> depreciate ->
 * dispose), against the real DB. Creates a temp cash account and asset,
 * then cleans everything up.
 *
 * Usage: node scripts/smokeTestFixedAssets.js
 */
require('dotenv').config();
const {
  sequelize, School, CashAccount, Account, FixedAsset, DepreciationEntry, JournalEntry, JournalLine,
} = require('../src/models');
const fixedAssetsService = require('../src/modules/fixedAssets/service');
const accountingService = require('../src/modules/accounting/service');

async function main() {
  await sequelize.authenticate();
  const school = await School.findOne();
  console.log(`Testing against school: ${school.name} (${school.id})`);

  const cashAccount = await accountingService.createCashAccount(school.id, { name: 'SMOKE TEST Asset Cash', kind: 'BANK' });

  let asset = await fixedAssetsService.createFixedAsset(school.id, null, {
    name: 'SMOKE TEST Laptop',
    category: 'ICT_EQUIPMENT',
    acquisitionDate: '2026-01-01',
    costPesewas: 1200000, // GHS 12,000
    residualValuePesewas: 0,
    usefulLifeMonths: 12,
    cashAccountId: cashAccount.id,
  });
  console.log('Asset purchased:', asset.assetCode);

  const tbAfterPurchase = await accountingService.getTrialBalance(school.id, {});
  console.log('Balanced after purchase:', tbAfterPurchase.totalDebitBalancePesewas === tbAfterPurchase.totalCreditBalancePesewas);

  const depResult = await fixedAssetsService.runDepreciation(school.id, null, {
    periodLabel: '2026-01', periodStart: '2026-01-01', periodEnd: '2026-01-31',
  });
  console.log('Depreciation run entries:', depResult.entries.length, 'amount:', depResult.entries[0]?.amountPesewas, '(expect 100000)');

  const tbAfterDep = await accountingService.getTrialBalance(school.id, {});
  console.log('Balanced after depreciation:', tbAfterDep.totalDebitBalancePesewas === tbAfterDep.totalCreditBalancePesewas);

  const disposal = await fixedAssetsService.disposeFixedAsset(school.id, asset.id, null, {
    disposalDate: '2026-02-01', disposalProceedsPesewas: 1000000, cashAccountId: cashAccount.id,
  });
  console.log('Disposed. bookValue:', disposal.bookValuePesewas, '(expect 1100000), accumulatedDep:', disposal.accumulatedDepreciationPesewas, '(expect 100000)');

  const tbAfterDisposal = await accountingService.getTrialBalance(school.id, {});
  console.log('Balanced after disposal:', tbAfterDisposal.totalDebitBalancePesewas === tbAfterDisposal.totalCreditBalancePesewas);

  // Cleanup
  const entries = await JournalEntry.findAll({
    where: { sourceType: ['ASSET_PURCHASE', 'DEPRECIATION', 'ASSET_DISPOSAL'] },
    include: [],
  });
  const relevantEntries = [];
  for (const e of entries) {
    if (e.sourceType === 'ASSET_PURCHASE' && e.sourceId === asset.id) relevantEntries.push(e.id);
  }
  const depEntries = await DepreciationEntry.findAll({ where: { fixedAssetId: asset.id } });
  const depEntryJournalIds = (await JournalEntry.findAll({
    where: { sourceType: 'DEPRECIATION', sourceId: depEntries.map((d) => d.id) },
  })).map((e) => e.id);
  const disposalEntry = await JournalEntry.findOne({ where: { sourceType: 'ASSET_DISPOSAL', sourceId: asset.id } });

  const allEntryIds = [...relevantEntries, ...depEntryJournalIds, ...(disposalEntry ? [disposalEntry.id] : [])];
  await JournalLine.destroy({ where: { journalEntryId: allEntryIds } });
  await JournalEntry.destroy({ where: { id: allEntryIds } });
  await DepreciationEntry.destroy({ where: { fixedAssetId: asset.id } });
  await FixedAsset.destroy({ where: { id: asset.id } });
  await CashAccount.destroy({ where: { id: cashAccount.id } });
  await Account.destroy({ where: { id: cashAccount.accountId } });

  const tbFinal = await accountingService.getTrialBalance(school.id, {});
  console.log('Final trial balance (should be 0/0):', tbFinal.totalDebitBalancePesewas, tbFinal.totalCreditBalancePesewas);
  console.log('Cleaned up. All checks passed.');

  process.exit(0);
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
