const ApiError = require('../../utils/ApiError');

function validateStaffDuty(req, res, next) {
  const { name } = req.body || {};
  if (!name) return next(new ApiError(400, 'name is required'));
  return next();
}

function validateDutyRosterEntry(req, res, next) {
  const { dutyId, staffId, date } = req.body || {};
  if (!dutyId) return next(new ApiError(400, 'dutyId is required'));
  if (!staffId) return next(new ApiError(400, 'staffId is required'));
  if (!date) return next(new ApiError(400, 'date is required'));
  return next();
}

module.exports = { validateStaffDuty, validateDutyRosterEntry };
