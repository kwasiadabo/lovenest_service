'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('staff', 'phone', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
    await queryInterface.addColumn('staff', 'email', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('staff', 'email');
    await queryInterface.removeColumn('staff', 'phone');
  },
};
