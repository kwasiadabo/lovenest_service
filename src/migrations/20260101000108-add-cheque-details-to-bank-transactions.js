'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Optional — not every withdrawal is by cheque (bank charges, standing
    // orders, wire transfers also post as WITHDRAWAL). Deposits never carry
    // these; the UI only shows them for a withdrawal.
    await queryInterface.addColumn('bank_transactions', 'chequeNumber', { type: Sequelize.STRING(50), allowNull: true });
    await queryInterface.addColumn('bank_transactions', 'chequeDate', { type: Sequelize.DATEONLY, allowNull: true });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('bank_transactions', 'chequeDate');
    await queryInterface.removeColumn('bank_transactions', 'chequeNumber');
  },
};
