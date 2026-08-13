'use strict';

const { randomUUID } = require('crypto');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  up: async (queryInterface) => {
    const [[school]] = await queryInterface.sequelize.query(`
      SELECT TOP 1 s.id AS schoolId, s.caWeight, s.examWeight, ay.id AS academicYearId
      FROM schools s
      INNER JOIN academic_years ay ON ay.schoolId = s.id AND ay.isCurrent = 1
    `);
    if (!school) throw new Error('No school with a current academic year found');

    const [[term]] = await queryInterface.sequelize.query(
      'SELECT TOP 1 id FROM terms WHERE schoolId = :schoolId AND academicYearId = :academicYearId AND isCurrent = 1',
      { replacements: { schoolId: school.schoolId, academicYearId: school.academicYearId } },
    );
    if (!term) throw new Error('No current term found for the current academic year');

    const classes = await queryInterface.sequelize.query(`
      SELECT c.id AS classId
      FROM classes c
      INNER JOIN levels l ON l.id = c.levelId
      WHERE c.schoolId = :schoolId AND l.name = 'Upper Primary'
    `, { replacements: { schoolId: school.schoolId }, type: queryInterface.sequelize.QueryTypes.SELECT });
    if (classes.length === 0) throw new Error('No Upper Primary classes found — seed classes first');

    const subjects = await queryInterface.sequelize.query(
      'SELECT id FROM subjects WHERE schoolId = :schoolId',
      { replacements: { schoolId: school.schoolId }, type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    if (subjects.length === 0) throw new Error('No subjects found — seed subjects first');

    // One class teacher per class, credited as both recordedBy/confirmedBy —
    // matches how class_teachers was already seeded (one homeroom teacher
    // per class, see seed-demo-teachers).
    const classTeachers = await queryInterface.sequelize.query(
      'SELECT classId, staffId FROM class_teachers WHERE schoolId = :schoolId',
      { replacements: { schoolId: school.schoolId }, type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    const staffIdByClassId = new Map(classTeachers.map((ct) => [ct.classId, ct.staffId]));

    const caWeight = Number(school.caWeight);
    const examWeight = Number(school.examWeight);
    const now = new Date();
    const rows = [];

    for (const klass of classes) {
      const assignments = await queryInterface.sequelize.query(
        'SELECT studentId FROM student_class_assignments WHERE classId = :classId AND academicYearId = :academicYearId',
        { replacements: { classId: klass.classId, academicYearId: school.academicYearId }, type: queryInterface.sequelize.QueryTypes.SELECT },
      );
      const staffId = staffIdByClassId.get(klass.classId) || null;

      for (const { studentId } of assignments) {
        for (const subject of subjects) {
          // classwork (CA) marks skew higher than exam marks — coursework is
          // typically less pressured than a sit-down exam, a realistic
          // spread for demo data rather than uniform noise.
          const caPercent = randomInt(55, 98);
          const examRaw = randomInt(35, 95);
          const caScaled = Math.round(caPercent * caWeight * 100) / 100;
          const examScaled = Math.round(examRaw * examWeight * 100) / 100;
          const totalScore = Math.round((caScaled + examScaled) * 100) / 100;

          rows.push({
            id: randomUUID(),
            schoolId: school.schoolId,
            classId: klass.classId,
            subjectId: subject.id,
            termId: term.id,
            studentId,
            caPercent,
            caScaled,
            examRaw,
            examScaled,
            totalScore,
            effort: null,
            recordedByStaffId: staffId,
            status: 'CONFIRMED',
            confirmedAt: now,
            confirmedByStaffId: staffId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // Batched — a full Upper Primary sweep (3 classes x 10 students x 8
    // subjects) is 240 rows, comfortably past SQL Server's 2100 parameter
    // limit if inserted in one go given exam_scores' column count.
    const BATCH_SIZE = 200;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.bulkInsert('exam_scores', rows.slice(i, i + BATCH_SIZE));
    }

    // eslint-disable-next-line no-console
    console.log(`Seeded ${rows.length} exam scores across ${classes.length} Upper Primary classes`);
  },

  down: async (queryInterface) => {
    const [[school]] = await queryInterface.sequelize.query(`
      SELECT TOP 1 s.id AS schoolId, ay.id AS academicYearId
      FROM schools s
      INNER JOIN academic_years ay ON ay.schoolId = s.id AND ay.isCurrent = 1
    `);
    if (!school) return;

    await queryInterface.sequelize.query(`
      DELETE es FROM exam_scores es
      INNER JOIN classes c ON c.id = es.classId
      INNER JOIN levels l ON l.id = c.levelId
      WHERE es.schoolId = :schoolId AND l.name = 'Upper Primary'
    `, { replacements: { schoolId: school.schoolId } });
  },
};
