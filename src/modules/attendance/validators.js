const ApiError = require('../../utils/ApiError');

// Single source of truth for allowed attendance statuses — imported by
// service.js, notify.js, and students/fullHistory.js rather than each
// re-declaring its own PRESENT/ABSENT literal (which is exactly how LATE
// was missed/removed cleanly the first time around).
const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT'];

const REASON_MAX_LENGTH = 200;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

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
    if (!ATTENDANCE_STATUSES.includes(record.status)) {
      return next(new ApiError(400, `Every record's status must be one of: ${ATTENDANCE_STATUSES.join(', ')}`));
    }
    // Optional per-student reason — recorded for Late/Absent, but not
    // enforced here (the school wants it captured when given, not required
    // to save the register).
    if (record.reason !== undefined && record.reason !== null) {
      if (typeof record.reason !== 'string') {
        return next(new ApiError(400, 'Every record\'s reason must be a string'));
      }
      if (record.reason.trim().length > REASON_MAX_LENGTH) {
        return next(new ApiError(400, `Every record's reason must be ${REASON_MAX_LENGTH} characters or fewer`));
      }
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

// Every field is optional (undefined = leave unchanged), matching
// schoolSettings/validators.js's partial-PATCH convention — only format
// (and, once all three are known, ordering) is checked.
function validateAttendanceSettingsUpdate(req, res, next) {
  const {
    reportingTime, latenessCutoffTime, autoAbsentCutoffTime,
  } = req.body || {};

  const fields = { reportingTime, latenessCutoffTime, autoAbsentCutoffTime };
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
      return next(new ApiError(400, `${name} must be a 24h "HH:MM" time`));
    }
  }

  return next();
}

module.exports = {
  validateRegisterQuery,
  validateRegisterSave,
  validateSummaryQuery,
  validateClassReportQuery,
  validateAttendanceSettingsUpdate,
  ATTENDANCE_STATUSES,
};
