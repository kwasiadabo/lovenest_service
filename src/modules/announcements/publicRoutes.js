const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./publicController');

const router = express.Router();

// Public, unauthenticated — no authenticate/requireTenant gate, same posture
// as admissions/publicRoutes.js. Rate-limited per IP as defense-in-depth;
// generous limit since this loads on every marketing-site page view/nav.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

router.get('/:schoolCode/active', limiter, controller.listActive);

module.exports = router;
