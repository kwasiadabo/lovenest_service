const ApiError = require('../../utils/ApiError');

function validateReportCardQuery(req, res, next) {
  if (!req.query.termId) return next(new ApiError(400, 'termId is required'));
  return next();
}

function validateIssueCreate(req, res, next) {
  if (!req.body.subject || !req.body.subject.trim()) return next(new ApiError(400, 'Subject is required'));
  if (!req.body.body || !req.body.body.trim()) return next(new ApiError(400, 'Message is required'));
  return next();
}

module.exports = { validateReportCardQuery, validateIssueCreate };
