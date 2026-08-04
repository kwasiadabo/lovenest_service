const express = require('express');
const request = require('supertest');
const { makeLimiter } = require('../../src/middleware/rateLimiters');

// Mounts the real limiter factory on a throwaway app — NOT through the real
// auth routes, which skip rate limiting under NODE_ENV=test (the whole
// suite runs with that set). This test temporarily flips NODE_ENV so the
// limiter's actual counting/blocking logic runs for real, then restores it.
describe('rate limiter (middleware/rateLimiters.js)', () => {
  let app;
  let originalNodeEnv;

  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // disable the test-only skip for this suite

    app = express();
    app.post('/ping', makeLimiter(10, 'Too many requests.'), (req, res) => res.json({ ok: true }));
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('allows up to the configured limit, then returns 429', async () => {
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/ping');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/ping');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('Too many requests.');
  });

  test('is skipped entirely when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    const skippedApp = express();
    skippedApp.post('/ping', makeLimiter(1, 'Too many requests.'), (req, res) => res.json({ ok: true }));

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(skippedApp).post('/ping');
      expect(res.status).toBe(200); // never 429, even past the limit of 1
    }
  });
});
