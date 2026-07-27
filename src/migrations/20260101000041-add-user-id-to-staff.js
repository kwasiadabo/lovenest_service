'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('staff', 'userId', {
      type: Sequelize.UUID,
      allowNull: true,
      // NO ACTION, not CASCADE — staff already cascades from School, and SQL
      // Server rejects a second cascade path to the same root table.
      references: { model: 'users', key: 'id' },
      onDelete: 'NO ACTION',
    });

    // A plain `unique: true` constraint won't work here: SQL Server treats
    // NULL as a value for uniqueness purposes and only allows a single NULL
    // row, which every not-yet-linked staff row would violate. A filtered
    // index (WHERE userId IS NOT NULL) is the correct MSSQL equivalent of
    // "unique among non-null values", and isn't expressible via
    // queryInterface.addIndex's cross-dialect options, so it's raw SQL.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE NONCLUSTERED INDEX staff_user_id_unique ON staff(userId) WHERE userId IS NOT NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP INDEX staff_user_id_unique ON staff');
    await queryInterface.removeColumn('staff', 'userId');
  },
};
