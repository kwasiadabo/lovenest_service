'use strict';

// One row per student+term — editorial/remarks fields only. Subject scores,
// position-in-class, number-on-roll, and attendance are always computed live
// from ExamScore/AttendanceRecord/StudentClassAssignment at request time
// (see reportCards/service.js#generateReportCard), never snapshotted here,
// so a later mark correction is always reflected without a re-sync step.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('report_cards', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table.
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      classId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'classes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      termId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      academicYearId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'academic_years', key: 'id' },
        onDelete: 'NO ACTION',
      },
      conduct: { type: Sequelize.STRING(100), allowNull: true },
      interest: { type: Sequelize.STRING(200), allowNull: true },
      classTeacherRemark: { type: Sequelize.STRING(1000), allowNull: true },
      headteacherRemark: { type: Sequelize.STRING(1000), allowNull: true },
      promotionStatus: {
        type: Sequelize.ENUM('PROMOTED', 'REPEATED', 'NOT_APPLICABLE'),
        allowNull: false,
        defaultValue: 'NOT_APPLICABLE',
      },
      promotedToClassId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'classes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      nextTermStartDate: { type: Sequelize.DATEONLY, allowNull: true },
      status: {
        type: Sequelize.ENUM('DRAFT', 'PUBLISHED'), allowNull: false, defaultValue: 'DRAFT',
      },
      publishedAt: { type: Sequelize.DATE, allowNull: true },
      publishedByStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdByStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('report_cards', ['schoolId']);
    await queryInterface.addIndex('report_cards', ['studentId', 'termId'], { unique: true, name: 'report_cards_unique_student_term' });
    await queryInterface.addIndex('report_cards', ['schoolId', 'classId', 'termId'], { name: 'report_cards_class_term' });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('report_cards');
  },
};
