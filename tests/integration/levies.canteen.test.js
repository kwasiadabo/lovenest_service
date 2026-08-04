const request = require('supertest');
const app = require('../../src/app');
const {
  AcademicYear, Student, Level, Class, StudentClassAssignment,
} = require('../../src/models');
const {
  createTestSchool, createTestCashAccount, cleanupSchool, loginAs,
} = require('../helpers/testFixtures');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Full flow for the recurring canteen-levy feature built this session:
// create a STUDENT-targeted DAILY levy, bulk-pay for one of two picked
// students, and confirm the period report correctly separates paid from
// defaulting students, with debt accumulating (not resetting) day over day.
describe('canteen levy: STUDENT-targeted DAILY levy + bulk payments + period report', () => {
  let school;
  let token;
  let cashAccount;
  let academicYear;
  let paidStudent;
  let defaultingStudent;
  let levy;

  beforeAll(async () => {
    school = await createTestSchool();
    token = (await loginAs(app, school.adminEmail)).accessToken;
    cashAccount = await createTestCashAccount(school.school.id);

    academicYear = await AcademicYear.create({
      schoolId: school.school.id, name: 'TEST 2026/2027', startDate: '2026-09-01', endDate: '2027-07-31',
    });

    const studentBase = {
      schoolId: school.school.id,
      gender: 'FEMALE',
      dateOfBirth: '2015-01-01',
      emergencyContactName: 'Test Guardian',
      emergencyContactPhone: '0240000000',
      admissionDate: '2023-09-01',
    };
    paidStudent = await Student.create({
      ...studentBase, studentNumber: `TEST-${Date.now()}-1`, firstName: 'Paid', lastName: 'Student',
    });
    defaultingStudent = await Student.create({
      ...studentBase, studentNumber: `TEST-${Date.now()}-2`, firstName: 'Defaulting', lastName: 'Student',
    });

    // A STUDENT-targeted levy's collection sheet/period report is built off
    // each picked student's current-year class assignment (an accepted,
    // documented gap from this session's canteen-levy work — see
    // levies/service.js#getInScopeAssignments) — without one, a student is
    // still individually billed (getStudentLevyStatement) but invisible on
    // the collection/period-report/defaulters views this test checks.
    const level = await Level.create({
      schoolId: school.school.id, name: 'TEST Level', category: 'PRIMARY', sequenceOrder: 1,
    });
    const klass = await Class.create({ schoolId: school.school.id, levelId: level.id, name: 'TEST 1A' });
    await StudentClassAssignment.bulkCreate([
      {
        schoolId: school.school.id, studentId: paidStudent.id, classId: klass.id, academicYearId: academicYear.id,
      },
      {
        schoolId: school.school.id, studentId: defaultingStudent.id, classId: klass.id, academicYearId: academicYear.id,
      },
    ]);

    const createRes = await request(app)
      .post('/api/v1/levies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academicYearId: academicYear.id,
        name: 'TEST Canteen Fee',
        targetType: 'STUDENT',
        frequency: 'DAILY',
        amountPesewas: 500,
        startDate: daysAgo(3), // 4 days elapsed as of today, inclusive
        students: [{ studentId: paidStudent.id }, { studentId: defaultingStudent.id }],
      });
    expect(createRes.status).toBe(201);
    levy = createRes.body;
  });

  afterAll(async () => {
    await cleanupSchool(school.school.id);
  });

  test('levy creation resolved STUDENT targeting and DAILY frequency', () => {
    expect(levy.targetType).toBe('STUDENT');
    expect(levy.frequency).toBe('DAILY');
    expect(levy.levyStudents.map((ls) => ls.studentId).sort()).toEqual(
      [paidStudent.id, defaultingStudent.id].sort(),
    );
  });

  test('bulk payment covers only the paid student\'s full accrued balance', async () => {
    const bulkRes = await request(app)
      .post(`/api/v1/levies/${levy.id}/bulk-payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidDate: daysAgo(0),
        method: 'CASH',
        cashAccountId: cashAccount.id,
        records: [{ studentId: paidStudent.id, amountPesewas: 2000 }], // 4 days * GHS0.05 = 2000 pesewas
      });

    expect(bulkRes.status).toBe(201);
    expect(bulkRes.body.count).toBe(1);
  });

  test('period report separates the paid student from the defaulting one, debt accumulated (not per-period)', async () => {
    const reportRes = await request(app)
      .get(`/api/v1/levies/${levy.id}/period-report`)
      .set('Authorization', `Bearer ${token}`);

    expect(reportRes.status).toBe(200);

    const defaulterIds = reportRes.body.defaulters.map((r) => r.student.id);
    expect(defaulterIds).toContain(defaultingStudent.id);
    expect(defaulterIds).not.toContain(paidStudent.id);

    const paidRow = reportRes.body.rows.find((r) => r.student.id === paidStudent.id);
    const defaultingRow = reportRes.body.rows.find((r) => r.student.id === defaultingStudent.id);

    expect(paidRow.owedPesewas).toBe(2000);
    expect(paidRow.paidPesewas).toBe(2000);
    expect(paidRow.balancePesewas).toBe(0);

    expect(defaultingRow.owedPesewas).toBe(2000); // accumulated over 4 days, not reset per-day
    expect(defaultingRow.paidPesewas).toBe(0);
    expect(defaultingRow.balancePesewas).toBe(2000);
  });
});
