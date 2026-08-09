'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('cash_accounts', 'isOnlineDefault', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('cash_accounts', 'isOnlineDefault');
  },
};
