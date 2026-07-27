'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('issues', {
      id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
      },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School (same
      // convention as attendance_records.studentId).
      parentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'parents', key: 'id' },
        onDelete: 'NO ACTION',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      subject: { type: Sequelize.STRING(150), allowNull: false },
      status: { type: Sequelize.ENUM('OPEN', 'RESOLVED'), allowNull: false, defaultValue: 'OPEN' },
      lastMessageAt: { type: Sequelize.DATE, allowNull: false },
      parentLastReadAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('issues', ['schoolId']);
    await queryInterface.addIndex('issues', ['schoolId', 'parentId']);
    await queryInterface.addIndex('issues', ['schoolId', 'status']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('issues');
  },
};
