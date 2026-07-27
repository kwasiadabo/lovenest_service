const {
  sequelize, FixedAsset, DepreciationEntry, CashAccount, Account,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { postJournalEntry } = require('../accounting/ledgerPoster');
const { FIXED_ASSET_CATEGORY_ACCOUNT_CODES } = require('../../utils/defaultChartOfAccounts');

const ASSET_INCLUDE = [
  { model: Account, as: 'assetAccount' },
  { model: Account, as: 'accumulatedDepreciationAccount' },
  { model: CashAccount, as: 'cashAccount' },
];

async function generateAssetCode(schoolId) {
  const rows = await tenantScoped(FixedAsset, schoolId).findAll({ attributes: ['assetCode'] });
  const maxNumber = rows.reduce((max, row) => {
    const match = /^FA-(\d+)$/.exec(row.assetCode);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `FA-${String(maxNumber + 1).padStart(6, '0')}`;
}

async function resolveAccountByCode(schoolId, code, transaction) {
  if (!code) return null;
  const account = await tenantScoped(Account, schoolId).findOne({ where: { code }, transaction });
  if (!account) throw new ApiError(500, `Chart of Accounts is missing account code ${code}`);
  return account;
}

async function listFixedAssets(schoolId, { status } = {}) {
  const where = {};
  if (status) where.status = status;
  return tenantScoped(FixedAsset, schoolId).findAll({ where, include: ASSET_INCLUDE, order: [['acquisitionDate', 'DESC']] });
}

async function getFixedAsset(schoolId, fixedAssetId) {
  const asset = await tenantScoped(FixedAsset, schoolId).findByPk(fixedAssetId, {
    include: [...ASSET_INCLUDE, { model: DepreciationEntry, as: 'depreciationEntries' }],
  });
  if (!asset) throw new ApiError(404, 'Fixed asset not found');
  return asset;
}

async function createFixedAsset(schoolId, userId, {
  name, category, acquisitionDate, costPesewas, residualValuePesewas, usefulLifeMonths, cashAccountId,
}) {
  if (category !== 'LAND' && !(Number(usefulLifeMonths) > 0)) {
    throw new ApiError(400, 'usefulLifeMonths is required and must be greater than 0 for a depreciable asset');
  }

  const assetId = await sequelize.transaction(async (transaction) => {
    const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(cashAccountId, { transaction });
    if (!cashAccount) throw new ApiError(400, 'cashAccountId does not refer to a valid cash account');

    const { assetAccountCode, accumulatedDepreciationAccountCode } = FIXED_ASSET_CATEGORY_ACCOUNT_CODES[category];
    const assetAccount = await resolveAccountByCode(schoolId, assetAccountCode, transaction);
    const accumulatedDepreciationAccount = await resolveAccountByCode(schoolId, accumulatedDepreciationAccountCode, transaction);
    const depreciationExpenseAccount = await resolveAccountByCode(schoolId, '5400', transaction);

    const assetCode = await generateAssetCode(schoolId);
    const asset = await tenantScoped(FixedAsset, schoolId).create({
      assetCode,
      name,
      category,
      acquisitionDate,
      costPesewas,
      residualValuePesewas: residualValuePesewas || 0,
      usefulLifeMonths: category === 'LAND' ? null : usefulLifeMonths,
      assetAccountId: assetAccount.id,
      accumulatedDepreciationAccountId: accumulatedDepreciationAccount ? accumulatedDepreciationAccount.id : null,
      depreciationExpenseAccountId: depreciationExpenseAccount.id,
      cashAccountId,
      createdByUserId: userId,
    }, { transaction });

    await postJournalEntry(schoolId, {
      entryDate: acquisitionDate,
      description: `Fixed asset purchased: ${name} (${assetCode})`,
      sourceType: 'ASSET_PURCHASE',
      sourceId: asset.id,
      userId,
      lines: [
        { accountId: assetAccount.id, debitPesewas: costPesewas },
        { accountId: cashAccount.accountId, creditPesewas: costPesewas },
      ],
    }, transaction);

    return asset.id;
  });
  // Fetched after the transaction commits — see payroll/service.js's
  // createPayrollRun for why querying an eager-loaded getter from inside
  // the still-open transaction deadlocks/times out against the live DB.
  return getFixedAsset(schoolId, assetId);
}

// One JournalEntry per asset per period (not one consolidated entry) so a
// single asset's mistaken depreciation can be reversed without unwinding
// the whole period's run — all-or-nothing per click via one outer
// transaction. Skips LAND (never depreciates), DISPOSED assets, fully
// depreciated assets, and any asset already depreciated for this
// periodLabel (guarded by the DB unique constraint too).
async function runDepreciation(schoolId, userId, { periodLabel, periodStart, periodEnd }) {
  return sequelize.transaction(async (transaction) => {
    const assets = await tenantScoped(FixedAsset, schoolId).findAll({
      where: { status: 'ACTIVE' },
      include: [{ model: DepreciationEntry, as: 'depreciationEntries' }],
      transaction,
    });

    const results = [];
    for (const asset of assets) {
      if (asset.category === 'LAND') continue;
      if (asset.depreciationEntries.some((e) => e.periodLabel === periodLabel)) continue;

      const accumulatedToDate = asset.depreciationEntries.reduce((sum, e) => sum + e.amountPesewas, 0);
      const depreciableBasePesewas = asset.costPesewas - asset.residualValuePesewas;
      const monthlyChargePesewas = Math.round(depreciableBasePesewas / asset.usefulLifeMonths);
      const remainingPesewas = depreciableBasePesewas - accumulatedToDate;
      const chargePesewas = Math.min(monthlyChargePesewas, Math.max(remainingPesewas, 0));
      if (chargePesewas <= 0) continue;

      const entry = await tenantScoped(DepreciationEntry, schoolId).create({
        fixedAssetId: asset.id, periodLabel, periodStart, periodEnd, amountPesewas: chargePesewas, runByUserId: userId,
      }, { transaction });

      await postJournalEntry(schoolId, {
        entryDate: periodEnd,
        description: `Depreciation: ${asset.name} (${asset.assetCode}) - ${periodLabel}`,
        sourceType: 'DEPRECIATION',
        sourceId: entry.id,
        userId,
        lines: [
          { accountId: asset.depreciationExpenseAccountId, debitPesewas: chargePesewas },
          { accountId: asset.accumulatedDepreciationAccountId, creditPesewas: chargePesewas },
        ],
      }, transaction);

      results.push({ fixedAssetId: asset.id, assetCode: asset.assetCode, amountPesewas: chargePesewas });
    }
    return { periodLabel, entries: results };
  });
}

async function disposeFixedAsset(schoolId, fixedAssetId, userId, {
  disposalDate, disposalProceedsPesewas, cashAccountId,
}) {
  return sequelize.transaction(async (transaction) => {
    const asset = await tenantScoped(FixedAsset, schoolId).findByPk(fixedAssetId, {
      include: [{ model: DepreciationEntry, as: 'depreciationEntries' }],
      transaction,
    });
    if (!asset) throw new ApiError(404, 'Fixed asset not found');
    if (asset.status !== 'ACTIVE') throw new ApiError(400, 'This asset has already been disposed');

    const proceedsPesewas = disposalProceedsPesewas || 0;
    const accumulatedDepreciationPesewas = asset.depreciationEntries.reduce((sum, e) => sum + e.amountPesewas, 0);
    const bookValuePesewas = asset.costPesewas - accumulatedDepreciationPesewas;

    const lines = [
      { accountId: asset.assetAccountId, creditPesewas: asset.costPesewas },
    ];
    if (accumulatedDepreciationPesewas > 0) {
      lines.push({ accountId: asset.accumulatedDepreciationAccountId, debitPesewas: accumulatedDepreciationPesewas });
    }
    if (proceedsPesewas > 0) {
      const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(cashAccountId, { transaction });
      if (!cashAccount) throw new ApiError(400, 'cashAccountId does not refer to a valid cash account');
      lines.push({ accountId: cashAccount.accountId, debitPesewas: proceedsPesewas });
    }
    if (proceedsPesewas > bookValuePesewas) {
      lines.push({ accountCode: '4900', creditPesewas: proceedsPesewas - bookValuePesewas });
    } else if (proceedsPesewas < bookValuePesewas) {
      lines.push({ accountCode: '5900', debitPesewas: bookValuePesewas - proceedsPesewas });
    }

    await postJournalEntry(schoolId, {
      entryDate: disposalDate,
      description: `Fixed asset disposed: ${asset.name} (${asset.assetCode})`,
      sourceType: 'ASSET_DISPOSAL',
      sourceId: asset.id,
      userId,
      lines,
    }, transaction);

    await asset.update({
      status: 'DISPOSED', disposalDate, disposalProceedsPesewas: proceedsPesewas,
    }, { transaction });

    return { assetId: asset.id, bookValuePesewas, accumulatedDepreciationPesewas };
  });
}

module.exports = {
  listFixedAssets,
  getFixedAsset,
  createFixedAsset,
  runDepreciation,
  disposeFixedAsset,
};
