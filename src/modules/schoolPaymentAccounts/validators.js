const ApiError = require('../../utils/ApiError');
const { PaymentAccount } = require('../../models');

function validateCreatePaymentAccount(req, res, next) {
  const {
    name, kind, accountNumber,
  } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new ApiError(400, 'name is required'));
  }
  if (!kind || !PaymentAccount.KINDS.includes(kind)) {
    return next(new ApiError(400, `kind must be one of: ${PaymentAccount.KINDS.join(', ')}`));
  }
  if (!accountNumber || typeof accountNumber !== 'string' || !accountNumber.trim()) {
    return next(new ApiError(400, 'accountNumber is required'));
  }

  return next();
}

module.exports = { validateCreatePaymentAccount };
