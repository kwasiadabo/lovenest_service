'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('levies', 'frequency', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'ONE_TIME',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('levies', 'frequency');
  },
};
