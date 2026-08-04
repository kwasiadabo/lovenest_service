const ApiError = require('../../utils/ApiError');

// Request-shape only — the real "is this name already taken/reserved"
// checks need DB access, so they live in service.js#createRole (same split
// as every other module's validators.js in this codebase).
function validateCreateRole(req, res, next) {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new ApiError(400, 'name is required'));
  }
  return next();
}

module.exports = { validateCreateRole };
