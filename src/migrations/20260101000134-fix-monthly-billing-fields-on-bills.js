'use strict';

// Corrects two things migration 20260101000133 didn't actually achieve on
// SQL Server, discovered after running it against the real database:
//
// 1. addColumn with an ENUM + defaultValue doesn't backfill existing rows
//    on this dialect (same quirk documented for `status` columns elsewhere,
//    e.g. 20260101000009-add-billing-to-schools.js) — every pre-existing
//    bill was left with billingCycle = NULL instead of 'TERMLY'.
// 2. changeColumn('bills', 'termId', { allowNull: true, references: ... })
//    did not actually drop the NOT NULL constraint on SQL Server — it just
//    added a second, duplicate FK constraint alongside the original one,
//    leaving termId still NOT NULL. A MONTHLY bill (termId: null) would
//    fail to insert until this is fixed.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query("UPDATE [bills] SET [billingCycle] = 'TERMLY' WHERE [billingCycle] IS NULL");

    const [foreignKeys] = await queryInterface.sequelize.query(`
      SELECT fk.name
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
      WHERE OBJECT_NAME(fk.parent_object_id) = 'bills' AND c.name = 'termId'
    `);
    for (const { name } of foreignKeys) {
      await queryInterface.sequelize.query(`ALTER TABLE [bills] DROP CONSTRAINT [${name}]`);
    }

    await queryInterface.sequelize.query('ALTER TABLE [bills] ALTER COLUMN [termId] CHAR(36) NULL');
    await queryInterface.sequelize.query(`
      ALTER TABLE [bills] ADD CONSTRAINT [FK_bills_termId] FOREIGN KEY ([termId]) REFERENCES [terms]([id])
    `);
  },

  down: async (queryInterface) => {
    // Data backfill isn't reversed (same convention as other corrective
    // migrations in this codebase). Schema-shape only: re-tighten termId —
    // only safe if no MONTHLY bill (termId IS NULL) exists yet.
    await queryInterface.sequelize.query('ALTER TABLE [bills] DROP CONSTRAINT [FK_bills_termId]');
    await queryInterface.sequelize.query('ALTER TABLE [bills] ALTER COLUMN [termId] CHAR(36) NOT NULL');
    await queryInterface.sequelize.query(`
      ALTER TABLE [bills] ADD CONSTRAINT [FK_bills_termId] FOREIGN KEY ([termId]) REFERENCES [terms]([id])
    `);
  },
};
