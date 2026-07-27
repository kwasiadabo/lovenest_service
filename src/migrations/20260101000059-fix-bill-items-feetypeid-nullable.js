'use strict';

// Migration 20260101000033 already tried to make bill_items.feeTypeId
// nullable (for ARREARS/DISCOUNT/INDIVIDUAL_DISCOUNT items, which carry no
// FeeType), but Sequelize's mssql changeColumn silently no-ops when handed
// { type: Sequelize.UUID, allowNull: true } on a column with an existing FK
// — it neither errors nor changes anything, so the column has stayed
// NOT NULL in every DB that ran it. UUID columns are physically CHAR(36) on
// this dialect (confirmed via INFORMATION_SCHEMA, not just this column), so
// the fix goes straight to raw SQL instead of relying on changeColumn again.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query('ALTER TABLE [bill_items] ALTER COLUMN [feeTypeId] char(36) NULL');
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DELETE FROM [bill_items] WHERE [feeTypeId] IS NULL');
    await queryInterface.sequelize.query('ALTER TABLE [bill_items] ALTER COLUMN [feeTypeId] char(36) NOT NULL');
  },
};
