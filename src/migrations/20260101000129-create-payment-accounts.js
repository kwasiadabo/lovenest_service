'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('payment_accounts', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      kind: { type: Sequelize.ENUM('BANK', 'MOBILE_MONEY'), allowNull: false },
      bankName: { type: Sequelize.STRING(100), allowNull: true },
      accountNumber: { type: Sequelize.STRING(50), allowNull: false },
      accountName: { type: Sequelize.STRING(150), allowNull: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('payment_accounts', ['schoolId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('payment_accounts');
  },
};
