const ApiError = require('../../utils/ApiError');

// The fixed, platform-wide roles every school can assign — a school's own
// custom roles (modules/roles) are assignable too, but aren't known here
// (they're per-school, DB-backed, not a static list) — see
// modules/roles/service.js's RESERVED_ROLE_NAMES for where this list is
// reused to keep a custom role from taking one of these names.
const ASSIGNABLE_ROLES = ['SCHOOL_ADMIN', 'ADMINISTRATOR', 'HEAD_TEACHER', 'TEACHER', 'ACCOUNTANT', 'DRIVER'];

// Shape only — whether each name actually resolves to a role this school
// may assign (a built-in, or one of its own custom roles) is checked where
// the DB is available: service.js#findAssignableRoles, which throws if any
// name doesn't resolve. Can't be a static membership check here since a
// school's custom roles aren't a fixed list.
function validateRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return 'roles must be a non-empty array';
  }
  const invalid = roles.find((role) => typeof role !== 'string' || !role.trim());
  if (invalid !== undefined) {
    return 'Each role must be a non-empty string';
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
