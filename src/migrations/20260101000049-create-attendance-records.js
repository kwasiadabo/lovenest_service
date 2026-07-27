'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('attendance_records', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table
      // (same convention as exam_scores).
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // classId/termId denormalized at mark-time, same rationale as
      // ExamScore's classId/subjectId/termId — keeps later per-term
      // aggregation a plain group-by and keeps history correct if a student
      // is reassigned to a different class mid-year.
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
      date: { type: Sequelize.DATEONLY, allowNull: false },
      status: { type: Sequelize.ENUM('PRESENT', 'ABSENT', 'LATE'), allowNull: false },
      markedByStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      notes: { type: Sequelize.STRING(200), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('attendance_records', ['schoolId']);
    // One status per student per day — re-marking updates this row, never
    // duplicates it.
    await queryInterface.addIndex('attendance_records', ['studentId', 'date'], { unique: true, name: 'attendance_records_unique_student_date' });
    // Drives the daily-register read/write for a class (getRegister/saveRegister).
    await queryInterface.addIndex('attendance_records', ['schoolId', 'classId', 'date'], { name: 'attendance_records_class_date' });
    // Drives per-student per-term aggregation for the report card.
    await queryInterface.addIndex('attendance_records', ['schoolId', 'studentId', 'termId'], { name: 'attendance_records_student_term' });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('attendance_records');
  },
};
