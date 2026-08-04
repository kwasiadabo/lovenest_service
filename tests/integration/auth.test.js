const request = require('supertest');
const app = require('../../src/app');
const { createTestSchool, cleanupSchool, TEST_PASSWORD } = require('../helpers/testFixtures');

describe('auth flows (integration)', () => {
  let fixture;

  beforeAll(async () => {
    fixture = await createTestSchool();
  });

  afterAll(async () => {
    await cleanupSchool(fixture.school.id);
  });

  describe('POST /api/v1/auth/login', () => {
    test('valid credentials return an access+refresh token and user profile', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: fixture.adminEmail, password: TEST_PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe(fixture.adminEmail);
      expect(res.body.user.roles).toContain('SCHOOL_ADMIN');
    });

    test('wrong password is rejected with a generic message', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: fixture.adminEmail, password: 'TotallyWrongPassword1!',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    test('unknown email gets the exact same message (no account enumeration)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'nobody-at-all@vx-test.invalid', password: 'whatever123',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    test('a suspended school blocks login even with correct credentials', async () => {
      const suspended = await createTestSchool({ status: 'suspended' });
      try {
        const res = await request(app).post('/api/v1/auth/login').send({
          email: suspended.adminEmail, password: TEST_PASSWORD,
        });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/suspended/i);
      } finally {
        await cleanupSchool(suspended.school.id);
      }
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    test('a valid refresh token issues a new token pair', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({
        email: fixture.adminEmail, password: TEST_PASSWORD,
      });

      const res = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: login.body.refreshToken,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    test('a garbage refresh token is rejected', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: 'not-a-real-token',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    test('wrong currentPassword is rejected', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({
        email: fixture.adminEmail, password: TEST_PASSWORD,
      });

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ currentPassword: 'WrongCurrentPassword1!', password: 'NewPassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/current password/i);
    });

    test('correct currentPassword updates the password, and the old password stops working', async () => {
      const changer = await createTestSchool();
      try {
        const login = await request(app).post('/api/v1/auth/login').send({
          email: changer.adminEmail, password: TEST_PASSWORD,
        });

        const changeRes = await request(app)
          .post('/api/v1/auth/change-password')
          .set('Authorization', `Bearer ${login.body.accessToken}`)
          .send({ currentPassword: TEST_PASSWORD, password: 'BrandNewPassword123!' });
        expect(changeRes.status).toBe(200);

        const oldLogin = await request(app).post('/api/v1/auth/login').send({
          email: changer.adminEmail, password: TEST_PASSWORD,
        });
        expect(oldLogin.status).toBe(401);

        const newLogin = await request(app).post('/api/v1/auth/login').send({
          email: changer.adminEmail, password: 'BrandNewPassword123!',
        });
        expect(newLogin.status).toBe(200);
      } finally {
        await cleanupSchool(changer.school.id);
      }
    });
  });
});
