const ApiError = require('../../utils/ApiError');

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return field;
    }
  }
  return null;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function validateSubject(req, res, next) {
  const missing = requireFields(req.body || {}, ['name', 'code']);
  if (missing) return next(new ApiError(400, `${missing} is required`));
  const { color } = req.body || {};
  if (color !== undefined && !HEX_COLOR_RE.test(color)) {
    return next(new ApiError(400, 'color must be a hex value like #2a78d6'));
  }
  return next();
}

module.exports = { validateSubject };
