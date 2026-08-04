const request = require('supertest');
const app = require('../../src/app');
const { AcademicYear, Term, Payment, School } = require('../../src/models');
const termBillingService = require('../../src/modules/billing/termBillingService');
const { createTestSchool, cleanupSchool, loginAs } = require('../helpers/testFixtures');

describe('termly billing', () => {
  let school;
  let token;
  let academicYear;
  let currentTerm;

  beforeAll(async () => {
    school = await createTestSchool();
    token = (await loginAs(app, school.adminEmail)).accessToken;

    academicYear = await AcademicYear.create({
      schoolId: school.school.id, name: 'TEST 2026/2027', startDate: '2026-09-01', endDate: '2027-07-31',
    });
    currentTerm = await Term.create({
      schoolId: school.school.id,
      academicYearId: academicYear.id,
      name: 'Term 1',
      sequence: 1,
      startDate: '2026-09-01',
      endDate: '2026-12-15',
      isCurrent: true,
    });
  });

  afterAll(async () => {
    await cleanupSchool(school.school.id);
  });

  test('POST /billing/initialize stamps the new Payment with the school\'s current term', async () => {
    const res = await request(app)
      .post('/api/v1/billing/initialize')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Payment.create() happens before the Paystack network call, so the row
    // (and its termId) exists regardless of whether that external call
    // succeeds (200) or the provider is unreachable from this environment
    // (502) — assert against the DB directly rather than the Paystack
    // round-trip, to keep this test independent of external network access.
    expect([200, 502]).toContain(res.status);

    const payment = await Payment.findOne({
      where: { schoolId: school.school.id, purpose: 'subscription' },
      order: [['createdAt', 'DESC']],
    });
    expect(payment).not.toBeNull();
    expect(payment.termId).toBe(currentTerm.id);
  });

  describe('termBillingService.handleTermIndebtedness (grace period)', () => {
    test('first call on an unpaid past term starts the grace clock and prompt flag exactly once', async () => {
      const pastTerm = await Term.create({
        schoolId: school.school.id,
        academicYearId: academicYear.id,
        name: 'TEST Past Term',
        sequence: 2,
        startDate: '2026-01-01',
        endDate: '2026-01-31', // already ended, and never paid for
        isCurrent: false,
      });

      let refreshed = await School.findByPk(school.school.id);
      expect(refreshed.termGraceEndsAt).toBeNull();
      expect(refreshed.termPaymentPromptSentAt).toBeNull();

      await termBillingService.handleTermIndebtedness(school.school.id, pastTerm);

      refreshed = await School.findByPk(school.school.id);
      expect(refreshed.termGraceEndsAt).not.toBeNull();
      expect(refreshed.termPaymentPromptSentAt).not.toBeNull();

      const graceEndsAtFirstCall = refreshed.termGraceEndsAt.getTime();
      const promptSentAtFirstCall = refreshed.termPaymentPromptSentAt.getTime();

      // Calling it again for the same still-unpaid debt must be a no-op —
      // the grace clock never restarts on a second detection.
      await termBillingService.handleTermIndebtedness(school.school.id, pastTerm);

      refreshed = await School.findByPk(school.school.id);
      expect(refreshed.termGraceEndsAt.getTime()).toBe(graceEndsAtFirstCall);
      expect(refreshed.termPaymentPromptSentAt.getTime()).toBe(promptSentAtFirstCall);
    });
  });
});
