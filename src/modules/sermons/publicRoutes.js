const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./publicController');

const router = express.Router();

// Public, unauthenticated — same posture as announcements/publicRoutes.js.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

router.get('/:schoolCode/today', limiter, controller.getToday);

module.exports = router;
