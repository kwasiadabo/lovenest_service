'use strict';

const { randomUUID } = require('crypto');

// Demo-only marker (email domain), used by `down` to find and remove exactly
// the rows this seeder created without touching any real staff.
const EMAIL_DOMAIN = 'westhatch.demo';

const TEACHERS = [
  { firstName: 'Kwame', lastName: 'Mensah', position: 'Headteacher' },
  { firstName: 'Abena', lastName: 'Owusu', position: 'Assistant Headteacher' },
  { firstName: 'Kofi', lastName: 'Boateng', position: 'Teacher' },
  { firstName: 'Efua', lastName: 'Asante', position: 'Teacher' },
  { firstName: 'Yaw', lastName: 'Agyeman', position: 'Teacher' },
  { firstName: 'Akosua', lastName: 'Darko', position: 'Teacher' },
  { firstName: 'Kwabena', lastName: 'Appiah', position: 'Teacher' },
  { firstName: 'Adjoa', lastName: 'Frimpong', position: 'Teacher' },
  { firstName: 'Kwesi', lastName: 'Osei', position: 'Teacher' },
  { firstName: 'Ama', lastName: 'Sarpong', position: 'Teacher' },
];

const QUALIFICATIONS = [
  'B.Ed Basic Education',
  'Diploma in Basic Education',
  'B.A. Education',
  'M.Ed Educational Leadership',
  'B.Sc. Education',
  'Post-Diploma in Education',
  'B.Ed Early Childhood Education',
  'M.A. Curriculum Studies',
  'B.Ed Mathematics',
  'B.Ed English Language',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDateOnly(startYear, endYear) {
  const year = randomInt(startYear, endYear);
  const month = randomInt(1, 12);
  const day = randomInt(1, 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

module.exports = {
  up: async (queryInterface) => {
    const [[school]] = await queryInterface.sequelize.query(`
      SELECT TOP 1 s.id AS schoolId
      FROM schools s
      INNER JOIN academic_years ay ON ay.schoolId = s.id AND ay.isCurrent = 1
    `);
    if (!school) throw new Error('No school with a current academic year found — set one up before seeding teachers');

    const now = new Date();
    const staffRows = TEACHERS.map((t, i) => ({
      id: randomUUID(),
      schoolId: school.schoolId,
      fullName: `${t.firstName} ${t.lastName}`,
      dateOfBirth: randomDateOnly(1975, 1998),
      dateHired: randomDateOnly(2018, 2025),
      position: t.position,
      staffType: 'TEACHING',
      qualification: QUALIFICATIONS[i % QUALIFICATIONS.length],
      phone: `024${String(4000000 + i).padStart(7, '0')}`,
      email: `${t.firstName}.${t.lastName}@${EMAIL_DOMAIN}`.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    }));

    await queryInterface.bulkInsert('staff', staffRows);

    const classes = await queryInterface.sequelize.query(
      'SELECT id FROM classes WHERE schoolId = :schoolId',
      { replacements: { schoolId: school.schoolId }, type: queryInterface.sequelize.QueryTypes.SELECT },
    );

    // Cycle the 10 teachers across every class so each class has a class
    // teacher (a couple of teachers end up covering two classes each).
    const classTeacherRows = classes.map((klass, i) => ({
      id: randomUUID(),
      schoolId: school.schoolId,
      classId: klass.id,
      staffId: staffRows[i % staffRows.length].id,
      createdAt: now,
      updatedAt: now,
    }));

    if (classTeacherRows.length > 0) {
      await queryInterface.bulkInsert('class_teachers', classTeacherRows);
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DELETE FROM class_teachers
      WHERE staffId IN (SELECT id FROM staff WHERE email LIKE '%@${EMAIL_DOMAIN}')
    `);
    await queryInterface.sequelize.query(`DELETE FROM staff WHERE email LIKE '%@${EMAIL_DOMAIN}'`);
  },
};
