'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('payments', 'purpose', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'subscription',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('payments', 'purpose');
  },
};
