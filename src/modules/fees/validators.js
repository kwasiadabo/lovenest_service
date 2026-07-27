const ApiError = require('../../utils/ApiError');
const { FeeType } = require('../../models');

function validateFeeType(req, res, next) {
  const { name, category } = req.body || {};
  if (!name) return next(new ApiError(400, 'name is required'));
  if (category !== undefined && !FeeType.CATEGORIES.includes(category)) {
    return next(new ApiError(400, `category must be one of: ${FeeType.CATEGORIES.join(', ')}`));
  }
  return next();
}

function validateFeeAmount(req, res, next) {
  const {
    academicYearId, levelId, feeTypeId, amountPesewas, termId, classId,
  } = req.body || {};
  if (!academicYearId) return next(new ApiError(400, 'academicYearId is required'));
  if (!levelId) return next(new ApiError(400, 'levelId is required'));
  if (!feeTypeId) return next(new ApiError(400, 'feeTypeId is required'));
  if (amountPesewas === undefined || amountPesewas === null || Number.isNaN(Number(amountPesewas))) {
    return next(new ApiError(400, 'amountPesewas is required and must be a number'));
  }
  if (Number(amountPesewas) < 0) return next(new ApiError(400, 'amountPesewas cannot be negative'));
  if (termId !== undefined && termId !== null && typeof termId !== 'string') {
    return next(new ApiError(400, 'termId must be a string'));
  }
  if (classId !== undefined && classId !== null && typeof classId !== 'string') {
    return next(new ApiError(400, 'classId must be a string'));
  }
  return next();
}

module.exports = { validateFeeType, validateFeeAmount };
