const ApiError = require('../../utils/ApiError');

function validateLogin(req, res, next) {
  const { email, password } = req.body || {};
  if (!email || typeof email !== 'string') {
    return next(new ApiError(400, 'email is required'));
  }
  if (!password || typeof password !== 'string') {
    return next(new ApiError(400, 'password is required'));
  }
  return next();
}

function validateRefresh(req, res, next) {
  const { refreshToken } = req.body || {};
  if (!refreshToken || typeof refreshToken !== 'string') {
    return next(new ApiError(400, 'refreshToken is required'));
  }
  return next();
}

function validateForgotPassword(req, res, next) {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return next(new ApiError(400, 'email is required'));
  }
  return next();
}

function validateResetPassword(req, res, next) {
  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string') {
    return next(new ApiError(400, 'token is required'));
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return next(new ApiError(400, 'password must be at least 8 characters'));
  }
  return next();
}

function validateChangePassword(req, res, next) {
  const { currentPassword, password } = req.body || {};
  if (!currentPassword || typeof currentPassword !== 'string') {
    return next(new ApiError(400, 'currentPassword is required'));
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return next(new ApiError(400, 'password must be at least 8 characters'));
  }
  return next();
}

module.exports = {
  validateLogin,
  validateRefresh,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
};
