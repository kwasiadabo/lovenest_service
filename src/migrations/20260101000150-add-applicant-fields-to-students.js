'use strict';

// Backs the public admissions applicant pipeline (see modules/admissions).
// applicantStatus is deliberately separate from the existing computed
// admissionStage (students/service.js#admissionStageFor, derived from class
// assignment + payment presence, never stored) — a student created via a
// public application isn't real/vetted yet, so it needs its own storable
// pre-enrollment state. null means "not from the public pipeline" (every
// existing student, and every student the staff-side AdmissionPage wizard
// creates going forward) and is what keeps this student out of normal
// listings — see students/service.js#listStudents' default filter.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('students', 'applicantStatus', {
      type: Sequelize.ENUM('APPLIED', 'SHORTLISTED', 'REJECTED', 'ACCEPTED'),
      allowNull: true,
    });
    await queryInterface.addColumn('students', 'applicantSelfPhone', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
    await queryInterface.addColumn('students', 'applicantSelfEmail', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('students', 'desiredClassLabel', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('students', 'applicationNotes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('students', 'applicationSubmittedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex('students', ['schoolId', 'applicantStatus']);
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('students', ['schoolId', 'applicantStatus']);
    await queryInterface.removeColumn('students', 'applicationSubmittedAt');
    await queryInterface.removeColumn('students', 'applicationNotes');
    await queryInterface.removeColumn('students', 'desiredClassLabel');
    await queryInterface.removeColumn('students', 'applicantSelfEmail');
    await queryInterface.removeColumn('students', 'applicantSelfPhone');

    // SQL Server won't drop a column that still has a CHECK constraint on it
    // (the ENUM's backing constraint) — find it by definition since
    // Sequelize auto-names it, same dance as
    // 20260101000081-add-transport-billing-fields.js.
    const [checkConstraints] = await queryInterface.sequelize.query(`
      SELECT cc.name
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('students') AND cc.definition LIKE '%applicantStatus%'
    `);
    for (const { name } of checkConstraints) {
      await queryInterface.sequelize.query(`ALTER TABLE [students] DROP CONSTRAINT [${name}]`);
    }
    await queryInterface.removeColumn('students', 'applicantStatus');
  },
};
