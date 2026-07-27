'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('schools', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      code: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      address: Sequelize.STRING,
      phone: Sequelize.STRING(30),
      email: Sequelize.STRING,
      logoUrl: Sequelize.STRING,
      status: {
        type: Sequelize.ENUM('trial', 'active', 'suspended'),
        allowNull: false,
        defaultValue: 'trial',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('schools');
  },
};
