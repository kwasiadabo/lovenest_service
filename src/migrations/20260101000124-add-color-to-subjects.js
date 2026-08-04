'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('subjects', 'color', {
      type: Sequelize.STRING(7),
      allowNull: false,
      defaultValue: '#2a78d6',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('subjects', 'color');
  },
};
