'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'gateLogDismissalTime', {
      type: Sequelize.STRING(5),
      allowNull: false,
      defaultValue: '15:00',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'gateLogDismissalTime');
  },
};
