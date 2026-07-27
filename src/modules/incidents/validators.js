const ApiError = require('../../utils/ApiError');
const { Incident } = require('../../models');

function validateCreateIncident(req, res, next) {
  const {
    subjectType, studentId, staffId, incidentDate, category, description,
  } = req.body || {};

  if (!subjectType || !Incident.SUBJECT_TYPES.includes(subjectType)) {
    return next(new ApiError(400, `subjectType must be one of: ${Incident.SUBJECT_TYPES.join(', ')}`));
  }
  if (subjectType === 'STUDENT' && !studentId) return next(new ApiError(400, 'studentId is required'));
  if (subjectType === 'STAFF' && !staffId) return next(new ApiError(400, 'staffId is required'));
  if (!incidentDate) return next(new ApiError(400, 'incidentDate is required'));
  if (!category || !Incident.CATEGORIES.includes(category)) {
    return next(new ApiError(400, `category must be one of: ${Incident.CATEGORIES.join(', ')}`));
  }
  if (!description || !description.trim()) return next(new ApiError(400, 'description is required'));

  return next();
}

function validateUpdateIncident(req, res, next) {
  const { category, severity, description } = req.body || {};
  if (category !== undefined && !Incident.CATEGORIES.includes(category)) {
    return next(new ApiError(400, `category must be one of: ${Incident.CATEGORIES.join(', ')}`));
  }
  if (severity !== undefined && !Incident.SEVERITIES.includes(severity)) {
    return next(new ApiError(400, `severity must be one of: ${Incident.SEVERITIES.join(', ')}`));
  }
  if (description !== undefined && !String(description).trim()) {
    return next(new ApiError(400, 'description cannot be empty'));
  }
  return next();
}

function validateIncidentStatus(req, res, next) {
  const { status } = req.body || {};
  if (!status || !Incident.STATUSES.includes(status)) {
    return next(new ApiError(400, `status must be one of: ${Incident.STATUSES.join(', ')}`));
  }
  return next();
}

// A null/absent actionType clears the action and needs nothing else checked.
function validateIncidentAction(req, res, next) {
  const { actionType, actionStatus } = req.body || {};
  if (!actionType) return next();

  if (!Incident.ACTION_TYPES.includes(actionType)) {
    return next(new ApiError(400, `actionType must be one of: ${Incident.ACTION_TYPES.join(', ')}`));
  }
  if (actionStatus !== undefined && !Incident.ACTION_STATUSES.includes(actionStatus)) {
    return next(new ApiError(400, `actionStatus must be one of: ${Incident.ACTION_STATUSES.join(', ')}`));
  }
  return next();
}

module.exports = {
  validateCreateIncident,
  validateUpdateIncident,
  validateIncidentStatus,
  validateIncidentAction,
};
