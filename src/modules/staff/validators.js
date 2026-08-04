const ApiError = require('../../utils/ApiError');
const { Staff } = require('../../models');

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return field;
    }
  }
  return null;
}

function validateStaff(req, res, next) {
  const missing = requireFields(req.body || {}, [
    'fullName',
    'phone',
    'gender',
    'dateOfBirth',
    'dateHired',
    'position',
    'staffType',
    'qualification',
  ]);
  if (missing) return next(new ApiError(400, `${missing} is required`));
  if (!Staff.POSITIONS.includes(req.body.position)) {
    return next(new ApiError(400, `position must be one of ${Staff.POSITIONS.join(', ')}`));
  }
  if (!['MALE', 'FEMALE'].includes(req.body.gender)) {
    return next(new ApiError(400, 'gender must be MALE or FEMALE'));
  }
  if (!['TEACHING', 'NON_TEACHING'].includes(req.body.staffType)) {
    return next(new ApiError(400, 'staffType must be TEACHING or NON_TEACHING'));
  }
  return next();
}

function validateStaffSeparation(req, res, next) {
  const { separationType } = req.body || {};
  if (!separationType) return next(new ApiError(400, 'separationType is required'));
  if (!Staff.SEPARATION_TYPES.includes(separationType)) {
    return next(new ApiError(400, `separationType must be one of: ${Staff.SEPARATION_TYPES.join(', ')}`));
  }
  return next();
}

// Shape only — whether each name actually resolves to a role this school
// may assign (a built-in, or one of its own custom roles — see
// modules/roles) is checked in users/service.js#createUser, which
// createStaffLogin (staff/service.js) delegates to.
function validateCreateLogin(req, res, next) {
  const { roles } = req.body || {};
  if (!Array.isArray(roles) || roles.length === 0) {
    return next(new ApiError(400, 'roles must be a non-empty array'));
  }
  const invalid = roles.find((role) => typeof role !== 'string' || !role.trim());
  if (invalid !== undefined) return next(new ApiError(400, 'Each role must be a non-empty string'));
  return next();
}

function validateLinkExistingUser(req, res, next) {
  if (!req.body?.userId) return next(new ApiError(400, 'userId is required'));
  return next();
}

module.exports = {
  validateStaff, validateStaffSeparation, validateCreateLogin, validateLinkExistingUser,
};
