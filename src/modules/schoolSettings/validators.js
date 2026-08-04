const ApiError = require('../../utils/ApiError');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every field here is optional (undefined = leave unchanged) — only format
// is checked when a field is actually present in the request.
function validateDiscountPercent(value, fieldName) {
  if (value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num) || num < 0 || num > 100) {
    return `${fieldName} must be a number between 0 and 100`;
  }
  return null;
}

function validateUpdateSettings(req, res, next) {
  const {
    smsSenderId, emailUser, emailAppPassword, thirdChildDiscountPercent, fourthChildAndAboveDiscountPercent,
    paymentInstructions,
  } = req.body || {};

  if (smsSenderId !== undefined && smsSenderId !== '' && typeof smsSenderId === 'string') {
    // Nalo Sender IDs are conventionally short alphanumeric names — reuse
    // the same 2-3 char shape as School.code isn't right here (a Sender ID
    // reads more like "MySchool", not a 2-3 char prefix), so this just caps
    // length/type rather than reusing isValidSchoolCode's stricter pattern.
    if (smsSenderId.trim().length > 20) {
      return next(new ApiError(400, 'smsSenderId must be 20 characters or fewer'));
    }
  } else if (smsSenderId !== undefined && typeof smsSenderId !== 'string') {
    return next(new ApiError(400, 'smsSenderId must be a string'));
  }

  if (emailUser !== undefined && emailUser !== '' && !EMAIL_PATTERN.test(emailUser)) {
    return next(new ApiError(400, 'emailUser must be a valid email address'));
  }

  if (emailAppPassword !== undefined && typeof emailAppPassword !== 'string') {
    return next(new ApiError(400, 'emailAppPassword must be a string'));
  }

  const thirdChildError = validateDiscountPercent(thirdChildDiscountPercent, 'thirdChildDiscountPercent');
  if (thirdChildError) return next(new ApiError(400, thirdChildError));

  const fourthChildError = validateDiscountPercent(fourthChildAndAboveDiscountPercent, 'fourthChildAndAboveDiscountPercent');
  if (fourthChildError) return next(new ApiError(400, fourthChildError));

  if (paymentInstructions !== undefined) {
    if (typeof paymentInstructions !== 'string') {
      return next(new ApiError(400, 'paymentInstructions must be a string'));
    }
    if (paymentInstructions.trim().length > 1000) {
      return next(new ApiError(400, 'paymentInstructions must be 1000 characters or fewer'));
    }
  }

  return next();
}

module.exports = { validateUpdateSettings };
