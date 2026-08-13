'use strict';

const { randomUUID } = require('crypto');

// Standard GES basic-school subject list — school-wide (Subject isn't
// level-scoped, see models/subject.js), so every level draws from this same
// set rather than each level getting its own subjects.
const SUBJECTS = [
  { name: 'English Language', code: 'ENG', color: '#2a78d6' },
  { name: 'Mathematics', code: 'MATH', color: '#d62a2a' },
  { name: 'Science', code: 'SCI', color: '#2ab86c' },
  { name: 'Social Studies', code: 'SOC', color: '#c98a1f' },
  { name: 'Religious and Moral Education (RME)', code: 'RME', color: '#7a4fd6' },
  { name: 'Ghanaian Language', code: 'GHL', color: '#4f8a3d' },
  { name: 'Computing', code: 'ICT', color: '#1fa3c9' },
  { name: 'Creative Arts', code: 'CRA', color: '#e07b1f' },
  { name: 'Physical and Health Education (PHE)', code: 'PHE', color: '#c9451f' },
  { name: 'French', code: 'FRE', color: '#d62a8e' },
];

module.exports = {
  up: async (queryInterface) => {
    const [[school]] = await queryInterface.sequelize.query('SELECT TOP 1 id FROM schools');
    if (!school) throw new Error('No school found — run the school seeder first');

    const [[{ subjectCount }]] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS subjectCount FROM subjects WHERE schoolId = :schoolId',
      { replacements: { schoolId: school.id } },
    );
    if (Number(subjectCount) > 0) {
      // eslint-disable-next-line no-console
      console.log('Skipping — this school already has subjects');
      return;
    }

    const now = new Date();
    await queryInterface.bulkInsert(
      'subjects',
      SUBJECTS.map((subject) => ({
        id: randomUUID(), schoolId: school.id, ...subject, createdAt: now, updatedAt: now,
      })),
    );
  },

  down: async (queryInterface) => {
    const [[school]] = await queryInterface.sequelize.query('SELECT TOP 1 id FROM schools');
    if (!school) return;
    await queryInterface.bulkDelete('subjects', {
      schoolId: school.id,
      code: SUBJECTS.map((s) => s.code),
    });
  },
};
