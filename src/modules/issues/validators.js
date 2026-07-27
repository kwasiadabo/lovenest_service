const ApiError = require('../../utils/ApiError');
const { Issue } = require('../../models');

function validateMessageBody(req, res, next) {
  if (!req.body.body || !req.body.body.trim()) return next(new ApiError(400, 'Message body is required'));
  return next();
}

function validateStatus(req, res, next) {
  if (!Issue.STATUSES.includes(req.body.status)) {
    return next(new ApiError(400, `status must be one of: ${Issue.STATUSES.join(', ')}`));
  }
  return next();
}

module.exports = { validateMessageBody, validateStatus };
