'use strict';

// Mirrors staff.userId (20260101000041-add-user-id-to-staff.js) — links a
// Parent record to a portal login, created on demand via
// students/service.js#createParentLogin rather than at Parent-creation time.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('parents', 'userId', {
      type: Sequelize.UUID,
      allowNull: true,
      // NO ACTION, not CASCADE — parents already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table.
      references: { model: 'users', key: 'id' },
      onDelete: 'NO ACTION',
    });

    // Filtered unique index (MSSQL's equivalent of "unique among non-null
    // values") — a plain unique constraint would only allow a single NULL
    // row across every not-yet-linked parent, same reasoning as staff.userId.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE NONCLUSTERED INDEX parents_user_id_unique ON parents(userId) WHERE userId IS NOT NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP INDEX parents_user_id_unique ON parents');
    await queryInterface.removeColumn('parents', 'userId');
  },
};
