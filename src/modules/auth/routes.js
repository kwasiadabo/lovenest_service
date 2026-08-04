const express = require('express');
const controller = require('./controller');
const {
  validateLogin,
  validateRefresh,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { makeLimiter } = require('../../middleware/rateLimiters');

const router = express.Router();

// No login gate sits in front of any of these — same per-IP throttling
// rationale as onboarding/routes.js's registerLimiter, applied here to close
// off unbounded credential-stuffing / password-spraying / reset-token
// guessing. Two tiers: a tighter one for the classic guessing targets
// (login, reset-password, change-password all accept a secret to check),
// and a slightly more generous one for forgot-password (legitimate typo
// retries are common, but this also sends an email so still worth capping)
// and refresh (fires automatically ~once per access-token lifetime for
// every active user, and schools are frequently behind one shared NAT'd IP,
// so this needs the most headroom of the five).
const loginLimiter = makeLimiter(10, 'Too many login attempts. Please try again later.');
const forgotPasswordLimiter = makeLimiter(5, 'Too many requests. Please try again later.');
const refreshLimiter = makeLimiter(30, 'Too many requests. Please try again later.');

router.post('/login', loginLimiter, validateLogin, controller.login);
router.post('/refresh', refreshLimiter, validateRefresh, controller.refresh);
router.post('/forgot-password', forgotPasswordLimiter, validateForgotPassword, controller.forgotPassword);
router.post('/reset-password', loginLimiter, validateResetPassword, controller.resetPassword);
router.post('/change-password', authenticate, loginLimiter, validateChangePassword, controller.changePassword);

module.exports = router;
