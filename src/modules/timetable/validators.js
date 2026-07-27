const ApiError = require('../../utils/ApiError');
const { TimetableSlot } = require('../../models');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validatePeriod(req, res, next) {
  const {
    name, startTime, endTime, sortOrder, isBreak,
  } = req.body || {};
  if (!name || !name.trim()) return next(new ApiError(400, 'name is required'));
  if (!TIME_RE.test(startTime || '')) return next(new ApiError(400, 'startTime must be in HH:MM (24h) format'));
  if (!TIME_RE.test(endTime || '')) return next(new ApiError(400, 'endTime must be in HH:MM (24h) format'));
  if (endTime <= startTime) return next(new ApiError(400, 'endTime must be after startTime'));
  if (sortOrder !== undefined && Number.isNaN(Number(sortOrder))) {
    return next(new ApiError(400, 'sortOrder must be a number'));
  }
  if (isBreak !== undefined && typeof isBreak !== 'boolean') {
    return next(new ApiError(400, 'isBreak must be true or false'));
  }
  return next();
}

function validateTimetableQuery(req, res, next) {
  if (!req.query.classId) return next(new ApiError(400, 'classId is required'));
  return next();
}

function validateTimetableSave(req, res, next) {
  const { classId, entries } = req.body || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!Array.isArray(entries)) return next(new ApiError(400, 'entries must be an array'));

  for (const entry of entries) {
    if (!entry.periodId) return next(new ApiError(400, 'Each entry requires a periodId'));
    if (!TimetableSlot.DAYS_OF_WEEK.includes(entry.dayOfWeek)) {
      return next(new ApiError(400, `Each entry's dayOfWeek must be one of: ${TimetableSlot.DAYS_OF_WEEK.join(', ')}`));
    }
  }

  const seen = new Set();
  for (const entry of entries) {
    const key = `${entry.dayOfWeek}:${entry.periodId}`;
    if (seen.has(key)) return next(new ApiError(400, 'entries contains more than one value for the same day and period'));
    seen.add(key);
  }

  return next();
}

module.exports = {
  validatePeriod,
  validateTimetableQuery,
  validateTimetableSave,
};
