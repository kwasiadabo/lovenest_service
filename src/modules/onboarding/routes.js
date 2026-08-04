const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('./controller');
const { validateRegisterSchool, validateInitializePayment } = require('./validators');
const { uploadLogo } = require('../../middleware/upload');

const router = express.Router();

// Public, unauthenticated account-creation endpoints — no login gate sits in
// front of them, so rate-limit per IP to blunt spam/abuse.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts. Please try again later.' },
});

router.post('/schools', registerLimiter, uploadLogo, validateRegisterSchool, controller.registerSchool);

// Paid self-serve flow used by the marketing site: initialize charges the
// registrant (rate-limited, same as /schools above); verify is polled by
// the post-Paystack callback page and isn't a state-changing action a spam
// script would benefit from repeating, so it's left unlimited.
router.post('/initialize-payment', registerLimiter, uploadLogo, validateInitializePayment, controller.initializePayment);
router.get('/verify-payment/:reference', controller.verifyPayment);

// Public school directory shown on the marketing site — read-only, no
// abuse surface worth rate-limiting.
router.get('/schools', controller.listSchools);

// Backs the branded login page (/s/:schoolCode/login) — same rationale as
// /schools above (public, read-only, no rate limit needed).
router.get('/schools/:code', controller.getSchoolByCode);

module.exports = router;
