'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('levels', 'admissionFeePesewas', { type: Sequelize.INTEGER, allowNull: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('levels', 'admissionFeePesewas');
  },
};
