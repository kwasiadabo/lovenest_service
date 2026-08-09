const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./publicController');
const { uploadStudentPhoto } = require('../../middleware/studentPhoto');

const router = express.Router();

// Public, unauthenticated — no authenticate/requireTenant gate, same posture
// as reportCards/publicRoutes.js. Rate-limited per IP as defense-in-depth
// against spam applications / verification scraping.
const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many applications submitted. Please try again later.' },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
});

router.post('/:schoolCode/apply', applyLimiter, uploadStudentPhoto, controller.submitApplication);
router.get('/applicants/:id/verify', verifyLimiter, controller.verifyApplicant);

module.exports = router;
