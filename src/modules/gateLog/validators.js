const ApiError = require('../../utils/ApiError');

const CHECKED_OUT_BY_TYPES = ['PARENT', 'AUTHORIZED_PERSON', 'SELF_DISMISSAL', 'OVERRIDE'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validateVerifyScan(req, res, next) {
  const { studentId, studentNumber } = req.body || {};
  if (!studentId || typeof studentId !== 'string') return next(new ApiError(400, 'studentId is required'));
  if (studentNumber !== undefined && studentNumber !== null && typeof studentNumber !== 'string') {
    return next(new ApiError(400, 'studentNumber must be a string'));
  }
  return next();
}

function validateCheckIn(req, res, next) {
  const { studentId, byName, byRelationship } = req.body || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (byName !== undefined && byName !== null && typeof byName !== 'string') {
    return next(new ApiError(400, 'byName must be a string'));
  }
  if (byRelationship !== undefined && byRelationship !== null && typeof byRelationship !== 'string') {
    return next(new ApiError(400, 'byRelationship must be a string'));
  }
  return next();
}

function validateCheckOut(req, res, next) {
  const {
    studentId, type, parentId, authorizedPersonId, override,
  } = req.body || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!CHECKED_OUT_BY_TYPES.includes(type)) {
    return next(new ApiError(400, `type must be one of: ${CHECKED_OUT_BY_TYPES.join(', ')}`));
  }
  if (type === 'PARENT' && !parentId) return next(new ApiError(400, 'parentId is required when type is PARENT'));
  if (type === 'AUTHORIZED_PERSON' && !authorizedPersonId) {
    return next(new ApiError(400, 'authorizedPersonId is required when type is AUTHORIZED_PERSON'));
  }
  if (type === 'OVERRIDE') {
    if (override !== true) return next(new ApiError(400, 'override must be confirmed (true) for an unlisted pickup'));
    if (!req.body.byName || typeof req.body.byName !== 'string' || !req.body.byName.trim()) {
      return next(new ApiError(400, 'byName is required for an override pickup'));
    }
  }
  return next();
}

function validateAuthorizedPickupPerson(req, res, next) {
  const { fullName, relationship } = req.body || {};
  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return next(new ApiError(400, 'fullName is required'));
  }
  if (!relationship || typeof relationship !== 'string' || !relationship.trim()) {
    return next(new ApiError(400, 'relationship is required'));
  }
  return next();
}

function validateGateLogSettingsUpdate(req, res, next) {
  const { dismissalTime } = req.body || {};
  if (dismissalTime !== undefined && (typeof dismissalTime !== 'string' || !TIME_PATTERN.test(dismissalTime))) {
    return next(new ApiError(400, 'dismissalTime must be a 24h "HH:MM" time'));
  }
  return next();
}

module.exports = {
  validateVerifyScan,
  validateCheckIn,
  validateCheckOut,
  validateAuthorizedPickupPerson,
  validateGateLogSettingsUpdate,
  CHECKED_OUT_BY_TYPES,
};
