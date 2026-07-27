'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('bill_payments', 'receiptNumber', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });

    // Backfill any pre-existing payments with a sequential number per school
    // (ordered by createdAt) before the column is locked down to NOT NULL.
    await queryInterface.sequelize.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY [schoolId] ORDER BY [createdAt]) AS rn
        FROM [bill_payments]
      )
      UPDATE bp
      SET bp.[receiptNumber] = 'RCT-' + RIGHT('000000' + CAST(n.rn AS VARCHAR(10)), 6)
      FROM [bill_payments] bp
      INNER JOIN numbered n ON n.id = bp.id
    `);

    await queryInterface.changeColumn('bill_payments', 'receiptNumber', {
      type: Sequelize.STRING(30),
      allowNull: false,
    });
    await queryInterface.addIndex('bill_payments', {
      unique: true,
      fields: ['schoolId', 'receiptNumber'],
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('bill_payments', ['schoolId', 'receiptNumber']);
    await queryInterface.removeColumn('bill_payments', 'receiptNumber');
  },
};
