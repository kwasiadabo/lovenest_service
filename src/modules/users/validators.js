const ApiError = require('../../utils/ApiError');

const ASSIGNABLE_ROLES = ['SCHOOL_ADMIN', 'ADMINISTRATOR', 'HEAD_TEACHER', 'TEACHER', 'ACCOUNTANT'];

function validateRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return 'roles must be a non-empty array';
  }
  const invalid = roles.find((role) => !ASSIGNABLE_ROLES.includes(role));
  if (invalid) {
    return `${invalid} is not an assignable role`;
  }
  return null;
}

function validateUpdateRoles(req, res, next) {
  const rolesError = validateRoles((req.body || {}).roles);
  if (rolesError) return next(new ApiError(400, rolesError));
  return next();
}

function validateStatus(req, res, next) {
  const { status } = req.body || {};
  if (!['active', 'disabled'].includes(status)) {
    return next(new ApiError(400, "status must be 'active' or 'disabled'"));
  }
  return next();
}

module.exports = { ASSIGNABLE_ROLES, validateUpdateRoles, validateStatus };
