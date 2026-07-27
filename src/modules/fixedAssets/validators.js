const ApiError = require('../../utils/ApiError');
const { FixedAsset } = require('../../models');

function validateCreateFixedAsset(req, res, next) {
  const {
    name, category, acquisitionDate, costPesewas, cashAccountId,
  } = req.body || {};
  if (!name || !name.trim()) return next(new ApiError(400, 'name is required'));
  if (!FixedAsset.CATEGORIES.includes(category)) {
    return next(new ApiError(400, `category must be one of: ${FixedAsset.CATEGORIES.join(', ')}`));
  }
  if (!acquisitionDate) return next(new ApiError(400, 'acquisitionDate is required'));
  if (!(Number(costPesewas) > 0)) return next(new ApiError(400, 'costPesewas must be greater than 0'));
  if (!cashAccountId) return next(new ApiError(400, 'cashAccountId is required'));
  return next();
}

function validateDepreciationRun(req, res, next) {
  const { periodLabel, periodStart, periodEnd } = req.body || {};
  if (!periodLabel || !periodLabel.trim()) return next(new ApiError(400, 'periodLabel is required'));
  if (!periodStart) return next(new ApiError(400, 'periodStart is required'));
  if (!periodEnd) return next(new ApiError(400, 'periodEnd is required'));
  return next();
}

function validateDisposal(req, res, next) {
  const { disposalDate, disposalProceedsPesewas } = req.body || {};
  if (!disposalDate) return next(new ApiError(400, 'disposalDate is required'));
  if (disposalProceedsPesewas !== undefined && Number(disposalProceedsPesewas) < 0) {
    return next(new ApiError(400, 'disposalProceedsPesewas cannot be negative'));
  }
  if (Number(disposalProceedsPesewas) > 0 && !req.body.cashAccountId) {
    return next(new ApiError(400, 'cashAccountId is required when there are disposal proceeds'));
  }
  return next();
}

module.exports = { validateCreateFixedAsset, validateDepreciationRun, validateDisposal };
