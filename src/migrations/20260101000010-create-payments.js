'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('payments', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      planCode: { type: Sequelize.STRING(30), allowNull: false },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      currency: { type: Sequelize.STRING(6), allowNull: false, defaultValue: 'GHS' },
      reference: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      paidAt: { type: Sequelize.DATE, allowNull: true },
      rawResponse: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('payments', ['schoolId']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('payments');
  },
};
