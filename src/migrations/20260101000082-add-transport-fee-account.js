'use strict';

// seedDefaultChartOfAccounts (utils/defaultChartOfAccounts.js) only runs at
// school onboarding, so a school created before this migration would never
// get the new 4060 "Transport Fees Income" account otherwise. Backfilled
// here via INSERT...SELECT, skipping any school that somehow already has the
// code (defensive against re-running).
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      INSERT INTO [accounts] (
        [id], [schoolId], [code], [name], [type], [normalBalance],
        [isContra], [isCashAccount], [isSystemAccount], [isActive], [createdAt], [updatedAt]
      )
      SELECT NEWID(), s.[id], '4060', 'Transport Fees Income', 'INCOME', 'CREDIT', 0, 0, 1, 1, GETDATE(), GETDATE()
      FROM [schools] s
      WHERE NOT EXISTS (
        SELECT 1 FROM [accounts] a WHERE a.[schoolId] = s.[id] AND a.[code] = '4060'
      )
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query("DELETE FROM [accounts] WHERE [code] = '4060'");
  },
};
