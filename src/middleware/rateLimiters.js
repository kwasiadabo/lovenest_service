const rateLimit = require('express-rate-limit');

// Shared factory for per-IP rate limiters (currently used by
// modules/auth/routes.js) — pulled out of that file so
// tests/unit/rateLimiter.test.js can exercise the limiter's own behavior in
// isolation, on a throwaway Express app, without going through the real
// auth routes (which skip rate limiting under NODE_ENV=test — see below).
//
// Skipped under NODE_ENV=test: the integration suite's supertest requests
// all share one in-process "IP", so without this every test file hitting a
// limited route would collectively trip the same 15-minute window well
// before the suite finishes.
function makeLimiter(limit, message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    skip: () => process.env.NODE_ENV === 'test',
  });
}

module.exports = { makeLimiter };
