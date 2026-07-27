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

const router = express.Router();

router.post('/login', validateLogin, controller.login);
router.post('/refresh', validateRefresh, controller.refresh);
router.post('/forgot-password', validateForgotPassword, controller.forgotPassword);
router.post('/reset-password', validateResetPassword, controller.resetPassword);
router.post('/change-password', authenticate, validateChangePassword, controller.changePassword);

module.exports = router;
