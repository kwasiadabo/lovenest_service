const request = require('supertest');
const app = require('../../src/app');
const { AcademicYear, Term } = require('../../src/models');
const { createTestSchool, cleanupSchool, loginAs } = require('../helpers/testFixtures');

// Regression test for the mass-assignment fix this session:
// updateAcademicYear/updateTerm used to call .update(req.body) directly,
// letting a caller inject schoolId (and, for terms, academicYearId).
// Both are now explicit field whitelists in academic/service.js.
describe('academic PATCH routes (mass-assignment fix)', () => {
  let schoolA;
  let schoolB;
  let yearA1;
  let yearA2;
  let termA1;
  let tokenA;

  beforeAll(async () => {
    schoolA = await createTestSchool();
    schoolB = await createTestSchool();

    yearA1 = await AcademicYear.create({
      schoolId: schoolA.school.id, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31',
    });
    yearA2 = await AcademicYear.create({
      schoolId: schoolA.school.id, name: '2027/2028', startDate: '2027-09-01', endDate: '2028-07-31',
    });
    termA1 = await Term.create({
      schoolId: schoolA.school.id,
      academicYearId: yearA1.id,
      name: 'Term 1',
      sequence: 1,
      startDate: '2026-09-01',
      endDate: '2026-12-15',
    });

    const login = await loginAs(app, schoolA.adminEmail);
    tokenA = login.accessToken;
  });

  afterAll(async () => {
    await cleanupSchool(schoolA.school.id);
    await cleanupSchool(schoolB.school.id);
  });

  test('PATCH /academic-years/:id: name updates; injected schoolId is ignored', async () => {
    const res = await request(app)
      .patch(`/api/v1/academic-years/${yearA1.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: '2026/2027 (Renamed)', schoolId: schoolB.school.id });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('2026/2027 (Renamed)');
    expect(res.body.schoolId).toBe(schoolA.school.id);

    const reloaded = await AcademicYear.findByPk(yearA1.id);
    expect(reloaded.schoolId).toBe(schoolA.school.id);
  });

  test('PATCH /terms/:id: name updates; injected schoolId/academicYearId are ignored', async () => {
    const res = await request(app)
      .patch(`/api/v1/terms/${termA1.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Term 1 (Renamed)',
        schoolId: schoolB.school.id,
        academicYearId: yearA2.id, // attempt to move this term into a different academic year
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Term 1 (Renamed)');
    expect(res.body.schoolId).toBe(schoolA.school.id);
    expect(res.body.academicYearId).toBe(yearA1.id);

    const reloaded = await Term.findByPk(termA1.id);
    expect(reloaded.schoolId).toBe(schoolA.school.id);
    expect(reloaded.academicYearId).toBe(yearA1.id);
  });
});
