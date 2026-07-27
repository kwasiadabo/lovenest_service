const ApiError = require('../../utils/ApiError');

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return field;
    }
  }
  return null;
}

function validateSubject(req, res, next) {
  const missing = requireFields(req.body || {}, ['name', 'code']);
  if (missing) return next(new ApiError(400, `${missing} is required`));
  return next();
}

module.exports = { validateSubject };
