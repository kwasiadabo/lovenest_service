const ApiError = require('../../utils/ApiError');
const { ExpenseRequest } = require('../../models');

function validateExpenseItem(req, res, next) {
  const { name } = req.body || {};
  if (!name || !name.trim()) return next(new ApiError(400, 'name is required'));
  return next();
}

function validateExpenseRequest(req, res, next) {
  const {
    expenseItemId, amountPesewas, description, expenseDate,
  } = req.body || {};
  if (!expenseItemId) return next(new ApiError(400, 'expenseItemId is required'));
  if (amountPesewas === undefined || amountPesewas === null || Number.isNaN(Number(amountPesewas))) {
    return next(new ApiError(400, 'amountPesewas is required and must be a number'));
  }
  if (Number(amountPesewas) <= 0) return next(new ApiError(400, 'amountPesewas must be greater than 0'));
  if (!description || !description.trim()) return next(new ApiError(400, 'description is required'));
  if (!expenseDate) return next(new ApiError(400, 'expenseDate is required'));
  return next();
}

// Approval only recognizes the liability (Dr Expense / Cr Accounts
// Payable) — no payment fields here anymore, those belong to
// validateMarkExpensePaid below, the separate "cash actually moved" step.
function validateExpenseApproval(req, res, next) {
  return next();
}

function validateMarkExpensePaid(req, res, next) {
  const { paymentMethod, paidDate, cashAccountId } = req.body || {};
  if (!paymentMethod) return next(new ApiError(400, 'paymentMethod is required'));
  if (!ExpenseRequest.METHODS.includes(paymentMethod)) {
    return next(new ApiError(400, `paymentMethod must be one of: ${ExpenseRequest.METHODS.join(', ')}`));
  }
  if (!paidDate) return next(new ApiError(400, 'paidDate is required'));
  if (!cashAccountId) return next(new ApiError(400, 'cashAccountId is required — which cash/bank/mobile-money account paid this'));
  return next();
}

// "No" or "not needed" isn't an audit trail — require an actual
// explanation, mirroring financials/validators.js's validatePaymentUpdate.
const MIN_REASON_WORDS = 4;

function validateExpenseRejection(req, res, next) {
  const reason = String(req.body?.rejectionReason || '').trim();
  if (!reason) return next(new ApiError(400, 'rejectionReason is required'));

  const wordCount = reason.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_REASON_WORDS) {
    return next(new ApiError(400, 'rejectionReason must be more than 3 words — please explain why this request is being rejected'));
  }
  return next();
}

module.exports = {
  validateExpenseItem,
  validateExpenseRequest,
  validateExpenseApproval,
  validateMarkExpensePaid,
  validateExpenseRejection,
};
