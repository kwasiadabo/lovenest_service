const { Op } = require('sequelize');
const {
  sequelize, PettyCashFund, PettyCashVoucher, PettyCashReplenishment, CashAccount, ExpenseItem, Staff, User,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { postJournalEntry, reverseEntryFor } = require('../accounting/ledgerPoster');
const { createCashAccount, getAccountBalances, createCashTransfer } = require('../accounting/service');
const { EXPENSE_CATEGORY_ACCOUNT_CODES } = require('../../utils/defaultChartOfAccounts');

const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

const FUND_INCLUDE = [
  { model: Staff, as: 'custodian' },
  { model: CashAccount, as: 'cashAccount' },
];

async function generateVoucherNumber(schoolId) {
  const rows = await tenantScoped(PettyCashVoucher, schoolId).findAll({ attributes: ['voucherNumber'] });
  const maxNumber = rows.reduce((max, row) => {
    const match = /^PCV-(\d+)$/.exec(row.voucherNumber);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `PCV-${String(maxNumber + 1).padStart(6, '0')}`;
}

async function findFund(schoolId, { transaction } = {}) {
  return tenantScoped(PettyCashFund, schoolId).findOne({ include: FUND_INCLUDE, transaction });
}

async function unreimbursedTotal(schoolId, pettyCashFundId, { transaction } = {}) {
  const rows = await tenantScoped(PettyCashVoucher, schoolId).findAll({
    where: { pettyCashFundId, status: 'ACTIVE', reimbursedAt: null },
    attributes: ['amountPesewas'],
    transaction,
  });
  return rows.reduce((sum, row) => sum + row.amountPesewas, 0);
}

// The fund's current float is never stored — it's the live balance of its
// underlying CashAccount, same "computed, not materialized" convention as
// every other cash account in this system.
async function getFund(schoolId) {
  const fund = await findFund(schoolId);
  if (!fund) return null;

  const balances = await getAccountBalances(schoolId, [fund.cashAccount.accountId]);
  return {
    ...fund.toJSON(),
    currentBalancePesewas: balances[fund.cashAccount.accountId] || 0,
    unreimbursedTotalPesewas: await unreimbursedTotal(schoolId, fund.id),
  };
}

async function setUpFund(schoolId, userId, {
  name, custodianStaffId, imprestFloatPesewas, openingAmountPesewas,
}) {
  const existing = await tenantScoped(PettyCashFund, schoolId).findOne();
  if (existing) throw new ApiError(409, 'A petty cash fund already exists for this school.');

  return sequelize.transaction(async (transaction) => {
    const cashAccount = await createCashAccount(schoolId, {
      name: name || 'Petty Cash',
      kind: 'CASH',
      openingBalancePesewas: openingAmountPesewas || 0,
    }, transaction);

    const fund = await tenantScoped(PettyCashFund, schoolId).create({
      name: name || 'Petty Cash',
      custodianStaffId: custodianStaffId || null,
      cashAccountId: cashAccount.id,
      imprestFloatPesewas,
      createdByUserId: userId,
    }, { transaction });

    return tenantScoped(PettyCashFund, schoolId).findByPk(fund.id, { include: FUND_INCLUDE, transaction });
  });
}

async function updateFund(schoolId, fundId, {
  name, custodianStaffId, imprestFloatPesewas,
}) {
  const fund = await tenantScoped(PettyCashFund, schoolId).findByPk(fundId);
  if (!fund) throw new ApiError(404, 'Petty cash fund not found');

  await fund.update({
    name: name !== undefined ? name : fund.name,
    custodianStaffId: custodianStaffId !== undefined ? custodianStaffId : fund.custodianStaffId,
    imprestFloatPesewas: imprestFloatPesewas !== undefined ? imprestFloatPesewas : fund.imprestFloatPesewas,
  });
  return tenantScoped(PettyCashFund, schoolId).findByPk(fund.id, { include: FUND_INCLUDE });
}

// Funding the float — for the first time, or adding money outside the
// normal voucher-reimbursement cycle (e.g. raising the target float amount)
// — is just an ordinary movement of cash into the fund's own cash account,
// so this reuses accounting/service.js's createCashTransfer (Dr fund's cash
// account / Cr the chosen source account) rather than posting a second,
// parallel implementation of the same Dr/Cr shape. Unlike recordReplenishment,
// the amount here is whatever the caller chooses — it isn't tied to any
// voucher, so it's fine (expected, even) when there's nothing unreimbursed.
async function topUpFund(schoolId, userId, {
  amountPesewas, sourceCashAccountId, topUpDate, reference,
}) {
  const fund = await findFund(schoolId);
  if (!fund) throw new ApiError(400, 'Set up a petty cash fund before topping it up.');

  return createCashTransfer(schoolId, userId, {
    fromCashAccountId: sourceCashAccountId,
    toCashAccountId: fund.cashAccountId,
    amountPesewas,
    transferDate: topUpDate,
    reference: reference || null,
    notes: `Petty cash top-up for ${fund.name}`,
  });
}

const VOUCHER_INCLUDE = [
  { model: ExpenseItem, as: 'expenseItem' },
  { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
];

async function listVouchers(schoolId, {
  status, from, to,
} = {}) {
  const where = {};
  if (status) where.status = status;
  if (from && to) where.voucherDate = { [Op.between]: [from, to] };
  else if (from) where.voucherDate = { [Op.gte]: from };
  else if (to) where.voucherDate = { [Op.lte]: to };
  return tenantScoped(PettyCashVoucher, schoolId).findAll({
    where,
    include: VOUCHER_INCLUDE,
    order: [['voucherDate', 'DESC'], ['createdAt', 'DESC']],
  });
}

// Disbursements post immediately — unlike Expenses, there's no separate
// approval step: petty cash is already a small, controlled float, and the
// moment the custodian hands it over IS the payment.
async function recordDisbursement(schoolId, userId, {
  voucherDate, paidTo, purpose, expenseItemId, amountPesewas,
}) {
  const fund = await findFund(schoolId);
  if (!fund) throw new ApiError(400, 'Set up a petty cash fund before recording a disbursement.');

  const balances = await getAccountBalances(schoolId, [fund.cashAccount.accountId]);
  const currentBalance = balances[fund.cashAccount.accountId] || 0;
  if (amountPesewas > currentBalance) {
    throw new ApiError(400, 'This amount is more than the petty cash float currently holds. Replenish the fund first.');
  }

  let accountCode = EXPENSE_CATEGORY_ACCOUNT_CODES.OTHER;
  if (expenseItemId) {
    const expenseItem = await tenantScoped(ExpenseItem, schoolId).findByPk(expenseItemId);
    if (!expenseItem) throw new ApiError(404, 'Expense item not found');
    accountCode = EXPENSE_CATEGORY_ACCOUNT_CODES[expenseItem.category] || EXPENSE_CATEGORY_ACCOUNT_CODES.OTHER;
  }

  return sequelize.transaction(async (transaction) => {
    const voucherNumber = await generateVoucherNumber(schoolId);
    const voucher = await tenantScoped(PettyCashVoucher, schoolId).create({
      pettyCashFundId: fund.id,
      voucherNumber,
      voucherDate,
      paidTo,
      purpose,
      expenseItemId: expenseItemId || null,
      amountPesewas,
      recordedByUserId: userId,
    }, { transaction });

    await postJournalEntry(schoolId, {
      entryDate: voucherDate,
      description: `Petty cash disbursement ${voucherNumber}: ${purpose}`,
      sourceType: 'PETTY_CASH_DISBURSEMENT',
      sourceId: voucher.id,
      userId,
      lines: [
        { accountCode, debitPesewas: amountPesewas },
        { accountId: fund.cashAccount.accountId, creditPesewas: amountPesewas },
      ],
    }, transaction);

    return tenantScoped(PettyCashVoucher, schoolId).findByPk(voucher.id, { include: VOUCHER_INCLUDE, transaction });
  });
}

async function voidVoucher(schoolId, voucherId, userId, { reason }) {
  const voucher = await tenantScoped(PettyCashVoucher, schoolId).findByPk(voucherId);
  if (!voucher) throw new ApiError(404, 'Voucher not found');
  if (voucher.status !== 'ACTIVE') throw new ApiError(400, 'Only an active voucher can be voided');
  if (voucher.reimbursedAt) {
    throw new ApiError(400, 'This voucher has already been reimbursed in a replenishment and can no longer be voided');
  }

  await sequelize.transaction(async (transaction) => {
    await reverseEntryFor(schoolId, 'PETTY_CASH_DISBURSEMENT', voucher.id, { userId, reason }, transaction);
    await voucher.update({ status: 'VOIDED' }, { transaction });
  });
  return tenantScoped(PettyCashVoucher, schoolId).findByPk(voucher.id, { include: VOUCHER_INCLUDE });
}

const REPLENISHMENT_INCLUDE = [
  { model: CashAccount, as: 'sourceCashAccount' },
  { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
];

async function listReplenishments(schoolId) {
  return tenantScoped(PettyCashReplenishment, schoolId).findAll({
    include: REPLENISHMENT_INCLUDE,
    order: [['replenishmentDate', 'DESC'], ['createdAt', 'DESC']],
  });
}

// Always tops the float back up by exactly what's been spent since the last
// replenishment — the amount is never independently entered, it's the sum
// of every still-unreimbursed voucher (standard imprest-system practice).
async function recordReplenishment(schoolId, userId, {
  replenishmentDate, sourceCashAccountId, reference,
}) {
  const fund = await findFund(schoolId);
  if (!fund) throw new ApiError(400, 'Set up a petty cash fund before recording a replenishment.');

  return sequelize.transaction(async (transaction) => {
    const unreimbursedVouchers = await tenantScoped(PettyCashVoucher, schoolId).findAll({
      where: { pettyCashFundId: fund.id, status: 'ACTIVE', reimbursedAt: null },
      transaction,
    });
    const totalAmountPesewas = unreimbursedVouchers.reduce((sum, v) => sum + v.amountPesewas, 0);
    if (totalAmountPesewas <= 0) throw new ApiError(400, 'There is nothing to replenish — every voucher is already reimbursed.');

    const sourceCashAccount = await tenantScoped(CashAccount, schoolId).findByPk(sourceCashAccountId, { transaction });
    if (!sourceCashAccount) throw new ApiError(400, 'sourceCashAccountId does not refer to a valid cash account');

    const replenishment = await tenantScoped(PettyCashReplenishment, schoolId).create({
      pettyCashFundId: fund.id,
      replenishmentDate,
      sourceCashAccountId,
      totalAmountPesewas,
      reference: reference || null,
      recordedByUserId: userId,
    }, { transaction });

    await postJournalEntry(schoolId, {
      entryDate: replenishmentDate,
      description: `Petty cash replenishment for ${fund.name}`,
      sourceType: 'PETTY_CASH_REPLENISHMENT',
      sourceId: replenishment.id,
      userId,
      lines: [
        { accountId: fund.cashAccount.accountId, debitPesewas: totalAmountPesewas },
        { accountId: sourceCashAccount.accountId, creditPesewas: totalAmountPesewas },
      ],
    }, transaction);

    await tenantScoped(PettyCashVoucher, schoolId).update(
      { reimbursedAt: new Date(), replenishmentId: replenishment.id },
      { where: { id: unreimbursedVouchers.map((v) => v.id) }, transaction },
    );

    return tenantScoped(PettyCashReplenishment, schoolId).findByPk(replenishment.id, {
      include: REPLENISHMENT_INCLUDE,
      transaction,
    });
  });
}

module.exports = {
  getFund,
  setUpFund,
  updateFund,
  topUpFund,
  listVouchers,
  recordDisbursement,
  voidVoucher,
  listReplenishments,
  recordReplenishment,
};
