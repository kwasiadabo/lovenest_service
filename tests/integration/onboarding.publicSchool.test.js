const request = require('supertest');
const app = require('../../src/app');
const { createTestSchool, cleanupSchool } = require('../helpers/testFixtures');

// Public, unauthenticated branding lookup backing /s/:schoolCode/login and
// the admissions apply page — see modules/admissions/service.js#getPublicSchoolInfo.
describe('GET /api/v1/public/admissions/:code (public branding lookup)', () => {
  let school;
  let suspendedSchool;

  beforeAll(async () => {
    school = await createTestSchool();
    suspendedSchool = await createTestSchool({ status: 'suspended' });
  });

  afterAll(async () => {
    await cleanupSchool(school.school.id);
    await cleanupSchool(suspendedSchool.school.id);
  });

  test('a real, non-suspended school\'s code returns only safe public fields, no auth required', async () => {
    const res = await request(app).get(`/api/v1/public/admissions/${school.school.code}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      code: school.school.code,
      name: school.school.name,
      logoUrl: null,
      brandColor: null,
      brandColorSecondary: null,
    });
    // No sensitive fields (email/phone/billing/etc.) should ever appear here.
    expect(res.body).not.toHaveProperty('email');
    expect(res.body).not.toHaveProperty('phone');
    expect(res.body).not.toHaveProperty('planCode');
    expect(res.body).not.toHaveProperty('subscriptionExpiresAt');
  });

  test('an unknown code returns 404', async () => {
    const res = await request(app).get('/api/v1/public/admissions/ZZZ-NOPE');
    expect(res.status).toBe(404);
  });

  test('a suspended school\'s code also returns 404 (not publicly discoverable)', async () => {
    const res = await request(app).get(`/api/v1/public/admissions/${suspendedSchool.school.code}`);
    expect(res.status).toBe(404);
  });
});
