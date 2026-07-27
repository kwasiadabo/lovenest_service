const ApiError = require('../../utils/ApiError');
const {
  Account, CashAccount, BankTransaction,
} = require('../../models');

function validateCreateAccount(req, res, next) {
  const {
    code, name, type, normalBalance,
  } = req.body || {};
  if (!code) return next(new ApiError(400, 'code is required'));
  if (!name) return next(new ApiError(400, 'name is required'));
  if (!Account.TYPES.includes(type)) return next(new ApiError(400, `type must be one of: ${Account.TYPES.join(', ')}`));
  if (!Account.NORMAL_BALANCES.includes(normalBalance)) {
    return next(new ApiError(400, `normalBalance must be one of: ${Account.NORMAL_BALANCES.join(', ')}`));
  }
  return next();
}

function validateCreateCashAccount(req, res, next) {
  const { name, kind } = req.body || {};
  if (!name) return next(new ApiError(400, 'name is required'));
  if (!CashAccount.KINDS.includes(kind)) return next(new ApiError(400, `kind must be one of: ${CashAccount.KINDS.join(', ')}`));
  return next();
}

function validateCashTransfer(req, res, next) {
  const {
    fromCashAccountId, toCashAccountId, amountPesewas, transferDate,
  } = req.body || {};
  if (!fromCashAccountId) return next(new ApiError(400, 'fromCashAccountId is required'));
  if (!toCashAccountId) return next(new ApiError(400, 'toCashAccountId is required'));
  if (amountPesewas === undefined || amountPesewas === null || Number(amountPesewas) <= 0) {
    return next(new ApiError(400, 'amountPesewas is required and must be greater than 0'));
  }
  if (!transferDate) return next(new ApiError(400, 'transferDate is required'));
  return next();
}

function validateBankTransaction(req, res, next) {
  const {
    cashAccountId, type, amountPesewas, transactionDate, contraAccountId,
  } = req.body || {};
  if (!cashAccountId) return next(new ApiError(400, 'cashAccountId is required'));
  if (!BankTransaction.TYPES.includes(type)) return next(new ApiError(400, `type must be one of: ${BankTransaction.TYPES.join(', ')}`));
  if (amountPesewas === undefined || amountPesewas === null || Number(amountPesewas) <= 0) {
    return next(new ApiError(400, 'amountPesewas is required and must be greater than 0'));
  }
  if (!transactionDate) return next(new ApiError(400, 'transactionDate is required'));
  if (!contraAccountId) return next(new ApiError(400, 'contraAccountId is required'));
  return next();
}

function validateVoidBankTransaction(req, res, next) {
  const { reason } = req.body || {};
  if (!reason || reason.trim().split(/\s+/).length < 3) {
    return next(new ApiError(400, 'reason is required and must explain the void (at least 3 words)'));
  }
  return next();
}

function validateStartReconciliation(req, res, next) {
  const { cashAccountId, statementDate, statementEndingBalancePesewas } = req.body || {};
  if (!cashAccountId) return next(new ApiError(400, 'cashAccountId is required'));
  if (!statementDate) return next(new ApiError(400, 'statementDate is required'));
  if (statementEndingBalancePesewas === undefined || statementEndingBalancePesewas === null || Number.isNaN(Number(statementEndingBalancePesewas))) {
    return next(new ApiError(400, 'statementEndingBalancePesewas is required'));
  }
  return next();
}

function validateJournalEntry(req, res, next) {
  const { entryDate, description, lines } = req.body || {};
  if (!entryDate) return next(new ApiError(400, 'entryDate is required'));
  if (!description) return next(new ApiError(400, 'description is required'));
  if (!Array.isArray(lines) || lines.length < 2) {
    return next(new ApiError(400, 'lines is required and must have at least two entries'));
  }
  for (const line of lines) {
    if (!line.accountId) return next(new ApiError(400, 'Each line requires an accountId'));
    const debit = Number(line.debitPesewas || 0);
    const credit = Number(line.creditPesewas || 0);
    if (debit > 0 && credit > 0) return next(new ApiError(400, 'A line cannot have both a debit and a credit'));
    if (debit === 0 && credit === 0) return next(new ApiError(400, 'A line must have a non-zero debit or credit'));
  }
  const totalDebit = lines.reduce((sum, l) => sum + Number(l.debitPesewas || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.creditPesewas || 0), 0);
  if (totalDebit !== totalCredit) {
    return next(new ApiError(400, `Entry is not balanced (debit ${totalDebit} !== credit ${totalCredit})`));
  }
  return next();
}

function validateJournalEntryUpdate(req, res, next) {
  const { reason } = req.body || {};
  if (!reason || reason.trim().split(/\s+/).length < 3) {
    return next(new ApiError(400, 'reason is required and must explain the change (at least 3 words)'));
  }
  return validateJournalEntry(req, res, next);
}

module.exports = {
  validateCreateAccount,
  validateCreateCashAccount,
  validateCashTransfer,
  validateBankTransaction,
  validateVoidBankTransaction,
  validateStartReconciliation,
  validateJournalEntry,
  validateJournalEntryUpdate,
};
