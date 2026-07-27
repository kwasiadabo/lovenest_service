'use strict';

// Platform-level, not schoolId-scoped — SSNIT contribution rates are
// national, the same for every school. See models/ssnitrate.js.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ssnit_rates', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      effectiveFrom: { type: Sequelize.DATEONLY, allowNull: false },
      employeeRatePercent: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      employerRatePercent: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('ssnit_rates', ['effectiveFrom']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('ssnit_rates');
  },
};
