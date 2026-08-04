const request = require('supertest');
const app = require('../../src/app');
const { Staff } = require('../../src/models');
const { createTestSchool, cleanupSchool, loginAs } = require('../helpers/testFixtures');

// Regression test for the mass-assignment fix this session: PATCH /staff/:id
// used to call staff.update(req.body) with no field whitelist, letting a
// caller inject schoolId/userId/status directly. It's now an explicit
// profile-field whitelist in staff/service.js#updateStaffMember.
describe('PATCH /api/v1/staff/:staffId (mass-assignment fix)', () => {
  let schoolA;
  let schoolB;
  let staffMember;
  let tokenA;

  beforeAll(async () => {
    schoolA = await createTestSchool();
    schoolB = await createTestSchool();

    staffMember = await Staff.create({
      schoolId: schoolA.school.id,
      fullName: 'Ama Test Teacher',
      phone: '0240000000',
      dateOfBirth: '1990-01-01',
      dateHired: '2020-01-01',
      position: 'Teacher',
      staffType: 'TEACHING',
      qualification: 'B.Ed',
    });

    const login = await loginAs(app, schoolA.adminEmail);
    tokenA = login.accessToken;
  });

  afterAll(async () => {
    await cleanupSchool(schoolA.school.id);
    await cleanupSchool(schoolB.school.id);
  });

  test('legitimate fields update; injected schoolId/userId/status are silently ignored', async () => {
    const res = await request(app)
      .patch(`/api/v1/staff/${staffMember.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        phone: '0249999999', // legitimate field — should update
        schoolId: schoolB.school.id, // injected — must be ignored
        userId: schoolB.adminUser.id, // injected — must be ignored
        status: 'SEPARATED', // injected — must be ignored (owned by /separate)
      });

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('0249999999');
    expect(res.body.schoolId).toBe(schoolA.school.id);
    expect(res.body.status).toBe('ACTIVE');

    const reloaded = await Staff.findByPk(staffMember.id);
    expect(reloaded.schoolId).toBe(schoolA.school.id);
    expect(reloaded.userId).toBeNull();
    expect(reloaded.status).toBe('ACTIVE');
    expect(reloaded.phone).toBe('0249999999');
  });
});
