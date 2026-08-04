const { PaymentAccount } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

async function listPaymentAccounts(schoolId, { isActive } = {}) {
  const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  return tenantScoped(PaymentAccount, schoolId).findAll({
    where,
    order: [['name', 'ASC']],
  });
}

async function createPaymentAccount(schoolId, {
  name, kind, bankName, accountNumber, accountName,
}) {
  return tenantScoped(PaymentAccount, schoolId).create({
    name,
    kind,
    bankName: bankName || null,
    accountNumber,
    accountName: accountName || null,
  });
}

async function updatePaymentAccount(schoolId, id, {
  name, bankName, accountNumber, accountName, isActive,
}) {
  const account = await tenantScoped(PaymentAccount, schoolId).findByPk(id);
  if (!account) throw new ApiError(404, 'Payment account not found');
  await account.update({
    name: name !== undefined ? name : account.name,
    bankName: bankName !== undefined ? bankName : account.bankName,
    accountNumber: accountNumber !== undefined ? accountNumber : account.accountNumber,
    accountName: accountName !== undefined ? accountName : account.accountName,
    isActive: isActive !== undefined ? isActive : account.isActive,
  });
  return account;
}

module.exports = { listPaymentAccounts, createPaymentAccount, updatePaymentAccount };
