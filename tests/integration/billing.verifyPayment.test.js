const { randomUUID } = require('crypto');
const request = require('supertest');
const app = require('../../src/app');
const { Payment } = require('../../src/models');
const { createTestSchool, cleanupSchool, loginAs } = require('../helpers/testFixtures');

// Regression test for the cross-tenant IDOR fixed this session:
// billing.verifyPayment used to look up a Payment by `reference` alone,
// with no schoolId check, letting any authenticated SCHOOL_ADMIN read (and
// even re-trigger billing-state transitions for) another school's payment
// by supplying that school's reference. It's now scoped by schoolId,
// mirroring getPaymentReceipt in the same file.
describe('GET /api/v1/billing/verify/:reference (cross-tenant scoping)', () => {
  let schoolA;
  let schoolB;
  let paymentA;
  let paymentB;
  let tokenA;

  beforeAll(async () => {
    schoolA = await createTestSchool();
    schoolB = await createTestSchool();

    paymentA = await Payment.create({
      schoolId: schoolA.school.id,
      purpose: 'subscription',
      planCode: 'tier_small',
      amountPesewas: 157500,
      currency: 'GHS',
      reference: `vx_test_${randomUUID()}`,
      status: 'success',
      paidAt: new Date(),
    });

    paymentB = await Payment.create({
      schoolId: schoolB.school.id,
      purpose: 'subscription',
      planCode: 'tier_small',
      amountPesewas: 157500,
      currency: 'GHS',
      reference: `vx_test_${randomUUID()}`,
      status: 'success',
      paidAt: new Date(),
    });

    const login = await loginAs(app, schoolA.adminEmail);
    tokenA = login.accessToken;
  });

  afterAll(async () => {
    await cleanupSchool(schoolA.school.id);
    await cleanupSchool(schoolB.school.id);
  });

  test('a school can verify its own payment reference', async () => {
    const res = await request(app)
      .get(`/api/v1/billing/verify/${paymentA.reference}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.school.id).toBe(schoolA.school.id);
    expect(res.body.status).toBe('success');
  });

  test('School A cannot verify/read School B\'s payment reference (the IDOR fix)', async () => {
    const res = await request(app)
      .get(`/api/v1/billing/verify/${paymentB.reference}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    // Explicitly assert School B's data never appears anywhere in the
    // response, not just that the status code is right.
    expect(JSON.stringify(res.body)).not.toContain(schoolB.school.id);
  });

  test('an unknown reference is also a 404', async () => {
    const res = await request(app)
      .get('/api/v1/billing/verify/vx_test_does_not_exist')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });
});
