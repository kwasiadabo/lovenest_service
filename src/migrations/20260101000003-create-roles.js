'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('roles', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      description: Sequelize.STRING,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('roles');
  },
};
