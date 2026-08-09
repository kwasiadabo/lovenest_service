const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./publicController');

const router = express.Router();

// Public, unauthenticated — no authenticate/requireTenant gate. The report
// card's own id is the only credential (see service.js#getPublicVerification's
// comment). Rate-limited per IP as defense-in-depth, even though a v4 UUID
// isn't practically guessable — same posture as onboarding/routes.js's own
// public, unauthenticated endpoints.
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
});

router.get('/:id/verify', verifyLimiter, controller.verify);

module.exports = router;
