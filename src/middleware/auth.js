const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');

// Verifies the JWT and attaches { userId, schoolId, roles } to req.auth.
// schoolId is null only for platform SuperAdmin tokens.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Missing or malformed Authorization header'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.userId,
      schoolId: payload.schoolId ?? null,
      roles: payload.roles || [],
    };
    return next();
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}

module.exports = { authenticate };
