const ApiError = require('../../utils/ApiError');

// Row-shape checks only — role/moduleKey/level are validated for real
// against config/permissions.js's lists in service.js#validatePermissionRows,
// same split as gradingSettings/validators.js (request-shape here, anything
// that needs the config module's data in the service).
function validateUpdatePermissions(req, res, next) {
  const { permissions } = req.body || {};
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return next(new ApiError(400, 'permissions is required and must be a non-empty array'));
  }
  const malformed = permissions.find(
    (row) => !row || typeof row.role !== 'string' || typeof row.moduleKey !== 'string' || typeof row.level !== 'string',
  );
  if (malformed) {
    return next(new ApiError(400, 'Each permission row needs a role, moduleKey, and level'));
  }
  return next();
}

module.exports = { validateUpdatePermissions };
