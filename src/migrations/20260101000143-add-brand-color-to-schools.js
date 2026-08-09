'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'brandColor', {
      type: Sequelize.STRING(7),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'brandColor');
  },
};
