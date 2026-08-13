'use strict';

const { randomUUID } = require('crypto');

// Demo-only marker isn't needed for `down` here — classes created by this
// seeder are found by schoolId + name, matching exactly the set `up` creates.
const CLASS_NAMES_BY_LEVEL = {
  'Pre-school': ['Pre-school 1', 'Pre-school 2', 'Pre-school 3', 'Pre-school 4'],
  'Lower Primary': ['1A', '2A', '3A'],
  'Upper Primary': ['4A', '5A', '6A'],
  JHS: ['1A', '2A', '3A'],
};

module.exports = {
  up: async (queryInterface) => {
    const [[school]] = await queryInterface.sequelize.query(`
      SELECT TOP 1 s.id AS schoolId
      FROM schools s
      INNER JOIN academic_years ay ON ay.schoolId = s.id AND ay.isCurrent = 1
    `);
    if (!school) throw new Error('No school with a current academic year found — set one up before seeding classes');

    const levels = await queryInterface.sequelize.query(
      'SELECT id, name FROM levels WHERE schoolId = :schoolId',
      { replacements: { schoolId: school.schoolId }, type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (levels.length === 0) throw new Error('No levels found for this school — run the school seeder first');

    const now = new Date();
    const classRows = [];
    for (const level of levels) {
      const names = CLASS_NAMES_BY_LEVEL[level.name] || [];
      for (const name of names) {
        classRows.push({
          id: randomUUID(),
          schoolId: school.schoolId,
          levelId: level.id,
          name,
          nextClassId: null,
          isGraduatingClass: false,
          feeBillingCycle: 'TERMLY',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await queryInterface.bulkInsert('classes', classRows);
  },

  down: async (queryInterface) => {
    const [[school]] = await queryInterface.sequelize.query(`
      SELECT TOP 1 s.id AS schoolId
      FROM schools s
      INNER JOIN academic_years ay ON ay.schoolId = s.id AND ay.isCurrent = 1
    `);
    if (!school) return;

    const allNames = Object.values(CLASS_NAMES_BY_LEVEL).flat();
    await queryInterface.bulkDelete('classes', {
      schoolId: school.schoolId,
      name: allNames,
    });
  },
};
