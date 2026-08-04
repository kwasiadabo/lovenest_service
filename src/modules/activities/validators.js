const ApiError = require('../../utils/ApiError');

const RATING_VALUES = ['BEGINNING', 'DEVELOPING', 'PROFICIENT', 'EXCELLING'];
const DAILY_RATING_VALUES = ['STRUGGLED', 'NEEDS_SUPPORT', 'OKAY', 'GOOD', 'EXCELLENT'];

function validateActivity(req, res, next) {
  const { levelId, domain, name } = req.body || {};
  if (!levelId) return next(new ApiError(400, 'levelId is required'));
  if (!domain || typeof domain !== 'string' || !domain.trim()) return next(new ApiError(400, 'domain is required'));
  if (!name || typeof name !== 'string' || !name.trim()) return next(new ApiError(400, 'name is required'));
  return next();
}

function validateRatingSave(req, res, next) {
  const {
    activityId, classId, termId, studentId, rating,
  } = req.body || {};
  if (!activityId) return next(new ApiError(400, 'activityId is required'));
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!RATING_VALUES.includes(rating)) {
    return next(new ApiError(400, `rating must be one of: ${RATING_VALUES.join(', ')}`));
  }
  return next();
}

function validateRatingScope(req, res, next) {
  const { classId, termId } = req.body || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  return next();
}

function validateDailyLogSave(req, res, next) {
  const {
    activityId, classId, termId, studentId, date, rating, note,
  } = req.body || {};
  if (!activityId) return next(new ApiError(400, 'activityId is required'));
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!date) return next(new ApiError(400, 'date is required'));
  if (!DAILY_RATING_VALUES.includes(rating)) {
    return next(new ApiError(400, `rating must be one of: ${DAILY_RATING_VALUES.join(', ')}`));
  }
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 500)) {
    return next(new ApiError(400, 'note must be a string of at most 500 characters'));
  }
  return next();
}

module.exports = {
  validateActivity,
  validateRatingSave,
  validateRatingScope,
  validateDailyLogSave,
  RATING_VALUES,
  DAILY_RATING_VALUES,
};
