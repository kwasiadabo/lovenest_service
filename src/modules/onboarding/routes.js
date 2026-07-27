const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./controller');
const { validateRegisterSchool } = require('./validators');
const { uploadLogo } = require('../../middleware/upload');

const router = express.Router();

// Public, unauthenticated account-creation endpoint — no login gate sits in
// front of it, so rate-limit per IP to blunt spam/abuse.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts. Please try again later.' },
});

router.post('/schools', registerLimiter, uploadLogo, validateRegisterSchool, controller.registerSchool);

module.exports = router;
