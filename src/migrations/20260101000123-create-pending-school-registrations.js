'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('pending_school_registrations', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      reference: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      email: { type: Sequelize.STRING, allowNull: false },
      payload: { type: Sequelize.TEXT, allowNull: false },
      tierCode: { type: Sequelize.STRING(30), allowNull: false },
      subscriptionAmountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      trainingAmountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      // No FK — set once completeRegistration creates the School, but the
      // school itself is never deleted as a side effect of this row.
      schoolId: { type: Sequelize.UUID, allowNull: true },
      completedAt: { type: Sequelize.DATE, allowNull: true },
      rawResponse: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('pending_school_registrations', ['status']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('pending_school_registrations');
  },
};
