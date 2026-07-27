'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('exam_scores', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table.
      classId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'classes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      subjectId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'subjects', key: 'id' },
        onDelete: 'NO ACTION',
      },
      termId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // Snapshot of all four values at save time — an audit trail that
      // survives later edits to the underlying classwork/project items,
      // same denormalization convention used by message_recipients.
      caPercent: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      caScaled: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      examRaw: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      examScaled: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      totalScore: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      recordedByStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('exam_scores', ['schoolId']);
    await queryInterface.addIndex(
      'exam_scores',
      ['schoolId', 'classId', 'subjectId', 'termId', 'studentId'],
      { unique: true, name: 'exam_scores_unique_scope' },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('exam_scores');
  },
};
