const ApiError = require('../utils/ApiError');

// Route guard for tenant-scoped endpoints (§1 of the plan): rejects requests
// that don't carry a schoolId (i.e. SuperAdmin tokens), which must instead go
// through the separate /api/platform namespace. Never trusts a client-supplied
// schoolId — the only source of truth is the JWT set by `authenticate`.
function requireTenant(req, res, next) {
  if (!req.auth || !req.auth.schoolId) {
    return next(new ApiError(403, 'This endpoint requires a school-scoped account'));
  }
  req.schoolId = req.auth.schoolId;
  return next();
}

module.exports = { requireTenant };
