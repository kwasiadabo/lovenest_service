'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('training_enrollments', {
      id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
      },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      mode: { type: Sequelize.STRING(20), allowNull: false },
      attendeeCount: { type: Sequelize.INTEGER, allowNull: false },
      costPesewas: { type: Sequelize.INTEGER, allowNull: false },
      paymentStatus: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      paidAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('training_enrollments');
  },
};
