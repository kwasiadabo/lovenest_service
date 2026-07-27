const ApiError = require('../../utils/ApiError');

function validateSetUpFund(req, res, next) {
  const { imprestFloatPesewas } = req.body || {};
  if (!Number.isFinite(imprestFloatPesewas) || imprestFloatPesewas <= 0) {
    return next(new ApiError(400, 'imprestFloatPesewas must be a positive number'));
  }
  return next();
}

function validateUpdateFund(req, res, next) {
  const { imprestFloatPesewas } = req.body || {};
  if (imprestFloatPesewas !== undefined && (!Number.isFinite(imprestFloatPesewas) || imprestFloatPesewas <= 0)) {
    return next(new ApiError(400, 'imprestFloatPesewas must be a positive number'));
  }
  return next();
}

function validateDisbursement(req, res, next) {
  const {
    voucherDate, paidTo, purpose, amountPesewas,
  } = req.body || {};
  if (!voucherDate) return next(new ApiError(400, 'voucherDate is required'));
  if (!paidTo || !paidTo.trim()) return next(new ApiError(400, 'paidTo is required'));
  if (!purpose || !purpose.trim()) return next(new ApiError(400, 'purpose is required'));
  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    return next(new ApiError(400, 'amountPesewas must be a positive number'));
  }
  return next();
}

function validateTopUp(req, res, next) {
  const { amountPesewas, sourceCashAccountId, topUpDate } = req.body || {};
  if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
    return next(new ApiError(400, 'amountPesewas must be a positive number'));
  }
  if (!sourceCashAccountId) return next(new ApiError(400, 'sourceCashAccountId is required'));
  if (!topUpDate) return next(new ApiError(400, 'topUpDate is required'));
  return next();
}

function validateReplenishment(req, res, next) {
  const { replenishmentDate, sourceCashAccountId } = req.body || {};
  if (!replenishmentDate) return next(new ApiError(400, 'replenishmentDate is required'));
  if (!sourceCashAccountId) return next(new ApiError(400, 'sourceCashAccountId is required'));
  return next();
}

// Same "explain yourself in more than a couple words" bar as the manual
// journal entry edit reason (accounting/validators.js).
function validateVoid(req, res, next) {
  const { reason } = req.body || {};
  if (!reason || reason.trim().split(/\s+/).length < 3) {
    return next(new ApiError(400, 'A reason of at least a few words is required to void a voucher'));
  }
  return next();
}

module.exports = {
  validateSetUpFund,
  validateUpdateFund,
  validateTopUp,
  validateDisbursement,
  validateReplenishment,
  validateVoid,
};
