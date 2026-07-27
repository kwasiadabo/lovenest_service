'use strict';

// Superseded by fee_types + level_fees, which supports more than one fee
// per level (admission, term, books, uniforms, custom) instead of a single
// hardcoded admission-fee column.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.removeColumn('levels', 'admissionFeePesewas');
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('levels', 'admissionFeePesewas', { type: Sequelize.INTEGER, allowNull: true });
  },
};
