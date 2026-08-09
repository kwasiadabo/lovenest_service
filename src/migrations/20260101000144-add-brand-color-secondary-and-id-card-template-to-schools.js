'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'brandColorSecondary', {
      type: Sequelize.STRING(7),
      allowNull: true,
    });
    await queryInterface.addColumn('schools', 'idCardTemplate', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'classic',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'brandColorSecondary');
    await queryInterface.removeColumn('schools', 'idCardTemplate');
  },
};
