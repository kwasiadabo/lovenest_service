'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('activity_daily_logs', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table.
      activityId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'activities', key: 'id' },
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
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      rating: {
        type: Sequelize.ENUM('STRUGGLED', 'NEEDS_SUPPORT', 'OKAY', 'GOOD', 'EXCELLENT'),
        allowNull: false,
      },
      note: { type: Sequelize.STRING(500), allowNull: true },
      recordedByStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('activity_daily_logs', ['schoolId']);
    await queryInterface.addIndex(
      'activity_daily_logs',
      ['activityId', 'classId', 'studentId', 'date'],
      { unique: true, name: 'activity_daily_logs_unique_scope' },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('activity_daily_logs');
  },
};
