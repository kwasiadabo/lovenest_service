const ApiError = require('../../utils/ApiError');

const AUDIENCES = ['PARENTS', 'TEACHERS'];

function validateComposeSend(req, res, next) {
  const {
    audience, smsRequested, emailRequested, subject, message, selectedKeys,
  } = req.body || {};

  if (!AUDIENCES.includes(audience)) {
    return next(new ApiError(400, `audience must be one of: ${AUDIENCES.join(', ')}`));
  }
  if (!smsRequested && !emailRequested) {
    return next(new ApiError(400, 'Select at least one channel (SMS or email)'));
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return next(new ApiError(400, 'message is required'));
  }
  if (emailRequested && (!subject || typeof subject !== 'string' || !subject.trim())) {
    return next(new ApiError(400, 'subject is required when sending email'));
  }
  if (selectedKeys !== undefined && !Array.isArray(selectedKeys)) {
    return next(new ApiError(400, 'selectedKeys must be an array'));
  }
  return next();
}

module.exports = { validateComposeSend };
