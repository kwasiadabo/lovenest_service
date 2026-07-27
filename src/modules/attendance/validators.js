const ApiError = require('../../utils/ApiError');

const STATUSES = ['PRESENT', 'ABSENT'];

function validateRegisterQuery(req, res, next) {
  const { classId, termId, date } = req.query || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  if (!date) return next(new ApiError(400, 'date is required'));
  return next();
}

function validateRegisterSave(req, res, next) {
  const {
    classId, termId, date, records,
  } = req.body || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  if (!date) return next(new ApiError(400, 'date is required'));
  if (!Array.isArray(records) || records.length === 0) {
    return next(new ApiError(400, 'records is required and must be a non-empty array'));
  }
  for (const record of records) {
    if (!record.studentId) return next(new ApiError(400, 'Every record must have a studentId'));
    if (!STATUSES.includes(record.status)) {
      return next(new ApiError(400, `Every record's status must be one of: ${STATUSES.join(', ')}`));
    }
  }
  return next();
}

function validateSummaryQuery(req, res, next) {
  const { classId, studentId, termId } = req.query || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  return next();
}

function validateClassReportQuery(req, res, next) {
  const { classId, termId } = req.query || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  return next();
}

module.exports = {
  validateRegisterQuery, validateRegisterSave, validateSummaryQuery, validateClassReportQuery, STATUSES,
};
