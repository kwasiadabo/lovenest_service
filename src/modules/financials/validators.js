const ApiError = require('../../utils/ApiError');
const { BillPayment, Bill } = require('../../models');

const TARGET_TYPES = ['LEVEL', 'CLASS', 'STUDENT'];

// Shared by /bills/generate and /bills/preview — a preview must accept
// exactly what generation would, so what it shows is what would happen.
function validateBillPeriodPayload(req, res, next) {
  const {
    billingCycle = 'TERMLY', academicYearId, termId, month, year, targetType, targetIds, feeTypeIds,
  } = req.body || {};
  if (!Bill.BILLING_CYCLES.includes(billingCycle)) {
    return next(new ApiError(400, `billingCycle must be one of: ${Bill.BILLING_CYCLES.join(', ')}`));
  }
  if (billingCycle === 'MONTHLY') {
    if (!month) return next(new ApiError(400, 'month is required for monthly billing'));
    if (!year) return next(new ApiError(400, 'year is required for monthly billing'));
  } else {
    if (!academicYearId) return next(new ApiError(400, 'academicYearId is required'));
    if (!termId) return next(new ApiError(400, 'termId is required'));
  }
  if (!TARGET_TYPES.includes(targetType)) {
    return next(new ApiError(400, `targetType must be one of: ${TARGET_TYPES.join(', ')}`));
  }
  if (!Array.isArray(targetIds) || targetIds.length === 0) {
    return next(new ApiError(400, 'targetIds is required and must be a non-empty array'));
  }
  if (!Array.isArray(feeTypeIds) || feeTypeIds.length === 0) {
    return next(new ApiError(400, 'feeTypeIds is required and must be a non-empty array'));
  }
  return next();
}

function validateSpecialItem(req, res, next) {
  const { feeTypeId, amountPesewas } = req.body || {};
  if (!feeTypeId) return next(new ApiError(400, 'feeTypeId is required'));
  if (amountPesewas === undefined || amountPesewas === null || Number.isNaN(Number(amountPesewas))) {
    return next(new ApiError(400, 'amountPesewas is required and must be a number'));
  }
  if (Number(amountPesewas) <= 0) return next(new ApiError(400, 'amountPesewas must be greater than 0'));
  return next();
}

// Shared by create and edit — an edit is validated exactly like a fresh
// payment, plus (in validatePaymentUpdate below) a mandatory reason.
function validatePaymentFields(body) {
  const {
    amountPesewas, method, paidDate, cashAccountId,
  } = body || {};
  if (amountPesewas === undefined || amountPesewas === null || Number.isNaN(Number(amountPesewas))) {
    return 'amountPesewas is required and must be a number';
  }
  if (Number(amountPesewas) <= 0) return 'amountPesewas must be greater than 0';
  if (!method) return 'method is required';
  if (!BillPayment.METHODS.includes(method)) {
    return `method must be one of: ${BillPayment.METHODS.join(', ')}`;
  }
  if (!paidDate) return 'paidDate is required';
  if (!cashAccountId) return 'cashAccountId is required — which cash/bank/mobile-money account received this payment';
  return null;
}

function validatePayment(req, res, next) {
  const error = validatePaymentFields(req.body);
  if (error) return next(new ApiError(400, error));
  return next();
}

// "Fixed it" or "typo" isn't an audit trail — require an actual explanation.
const MIN_REASON_WORDS = 4;

function validatePaymentUpdate(req, res, next) {
  const error = validatePaymentFields(req.body);
  if (error) return next(new ApiError(400, error));

  const reason = String(req.body?.reason || '').trim();
  if (!reason) return next(new ApiError(400, 'reason is required'));

  const wordCount = reason.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_REASON_WORDS) {
    return next(new ApiError(400, 'reason must be more than 3 words — please explain why this payment is being corrected'));
  }
  return next();
}

function validateConfirmBatch(req, res, next) {
  const { billIds } = req.body || {};
  if (!Array.isArray(billIds) || billIds.length === 0) {
    return next(new ApiError(400, 'billIds is required and must be a non-empty array'));
  }
  return next();
}

function validateSendReminders(req, res, next) {
  const { studentIds } = req.body || {};
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return next(new ApiError(400, 'studentIds is required and must be a non-empty array'));
  }
  return next();
}

module.exports = {
  validateGenerateBills: validateBillPeriodPayload,
  validatePreviewBills: validateBillPeriodPayload,
  validateSpecialItem,
  validatePayment,
  validatePaymentUpdate,
  validateConfirmBatch,
  validateSendReminders,
};
