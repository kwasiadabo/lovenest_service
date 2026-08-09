'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('authorized_pickup_persons', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      fullName: { type: Sequelize.STRING(150), allowNull: false },
      relationship: { type: Sequelize.STRING(50), allowNull: false },
      phone: { type: Sequelize.STRING(30), allowNull: true },
      notes: { type: Sequelize.STRING(200), allowNull: true },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
      addedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('authorized_pickup_persons', ['schoolId']);
    await queryInterface.addIndex('authorized_pickup_persons', ['schoolId', 'studentId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('authorized_pickup_persons');
  },
};
