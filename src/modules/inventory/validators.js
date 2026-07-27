const ApiError = require('../../utils/ApiError');
const { InventoryItem } = require('../../models');

function validateInventoryItem(req, res, next) {
  const { name, category, unit, reorderLevel } = req.body || {};
  if (!name || !name.trim()) return next(new ApiError(400, 'name is required'));
  if (category && !InventoryItem.CATEGORIES.includes(category)) {
    return next(new ApiError(400, `category must be one of: ${InventoryItem.CATEGORIES.join(', ')}`));
  }
  if (unit !== undefined && !String(unit).trim()) return next(new ApiError(400, 'unit cannot be blank'));
  if (reorderLevel !== undefined && (Number.isNaN(Number(reorderLevel)) || Number(reorderLevel) < 0)) {
    return next(new ApiError(400, 'reorderLevel must be a non-negative number'));
  }
  return next();
}

function validateRestock(req, res, next) {
  const { quantity } = req.body || {};
  if (quantity === undefined || Number.isNaN(Number(quantity)) || Number(quantity) <= 0) {
    return next(new ApiError(400, 'quantity is required and must be greater than 0'));
  }
  return next();
}

function validateInventoryRequest(req, res, next) {
  const { inventoryItemId, quantity, purpose } = req.body || {};
  if (!inventoryItemId) return next(new ApiError(400, 'inventoryItemId is required'));
  if (quantity === undefined || Number.isNaN(Number(quantity)) || Number(quantity) <= 0) {
    return next(new ApiError(400, 'quantity is required and must be greater than 0'));
  }
  if (!purpose || !purpose.trim()) return next(new ApiError(400, 'purpose is required'));
  return next();
}

// "No" or "not needed" isn't an audit trail — require an actual
// explanation, mirroring expenses/validators.js's validateExpenseRejection.
const MIN_REASON_WORDS = 4;

function validateInventoryRejection(req, res, next) {
  const reason = String(req.body?.rejectionReason || '').trim();
  if (!reason) return next(new ApiError(400, 'rejectionReason is required'));

  const wordCount = reason.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_REASON_WORDS) {
    return next(new ApiError(400, 'rejectionReason must be more than 3 words — please explain why this request is being rejected'));
  }
  return next();
}

module.exports = {
  validateInventoryItem,
  validateRestock,
  validateInventoryRequest,
  validateInventoryRejection,
};
