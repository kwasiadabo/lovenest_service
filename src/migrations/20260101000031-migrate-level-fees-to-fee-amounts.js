'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Rename first — every later statement (including the raw-SQL index
    // lookup) targets the final name. sp_rename does NOT rename the old
    // unique index itself, hence the sys.indexes lookup below rather than
    // guessing Sequelize's generated index name.
    await queryInterface.renameTable('level_fees', 'fee_amounts');

    const [oldIndexes] = await queryInterface.sequelize.query(`
      SELECT i.name
      FROM sys.indexes i
      WHERE i.object_id = OBJECT_ID('fee_amounts')
        AND i.is_unique = 1 AND i.is_primary_key = 0
    `);
    for (const { name } of oldIndexes) {
      await queryInterface.sequelize.query(`DROP INDEX [${name}] ON [fee_amounts]`);
    }

    // New dimension columns. All nullable at the DB level — a fee amount is
    // logically always tied to an academic year, but SQL Server can't
    // enforce a composite unique key across columns that are sometimes
    // NULL (termId/classId), so uniqueness is enforced in the service layer
    // instead. NO ACTION, not CASCADE — schoolId already cascades from
    // School, and SQL Server rejects a second cascade path to the same root.
    await queryInterface.addColumn('fee_amounts', 'academicYearId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'academic_years', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.addColumn('fee_amounts', 'termId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'terms', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.addColumn('fee_amounts', 'classId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'classes', key: 'id' },
      onDelete: 'NO ACTION',
    });

    // Backfill academicYearId on existing rows so they don't silently
    // disappear from a UI that always filters by year.
    // Pass 1: each school's current academic year, if it has one.
    await queryInterface.sequelize.query(`
      UPDATE fa
      SET fa.academicYearId = ay.id
      FROM fee_amounts fa
      INNER JOIN academic_years ay ON ay.schoolId = fa.schoolId AND ay.isCurrent = 1
      WHERE fa.academicYearId IS NULL
    `);
    // Pass 2: schools with no isCurrent year — fall back to their most
    // recently-started academic year.
    await queryInterface.sequelize.query(`
      UPDATE fa
      SET fa.academicYearId = latest.id
      FROM fee_amounts fa
      CROSS APPLY (
        SELECT TOP 1 ay.id FROM academic_years ay
        WHERE ay.schoolId = fa.schoolId ORDER BY ay.startDate DESC
      ) latest
      WHERE fa.academicYearId IS NULL
    `);
    // Rows for schools with zero academic years stay NULL — nothing is
    // deleted, they just won't show up in the year-scoped UI until the
    // school creates an academic year and the admin re-enters the amount.

    await queryInterface.addIndex('fee_amounts', ['academicYearId']);
    await queryInterface.addIndex('fee_amounts', ['termId']);
    await queryInterface.addIndex('fee_amounts', ['levelId']);
    await queryInterface.addIndex('fee_amounts', ['classId']);
    await queryInterface.addIndex('fee_amounts', ['feeTypeId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('fee_amounts', ['feeTypeId']);
    await queryInterface.removeIndex('fee_amounts', ['classId']);
    await queryInterface.removeIndex('fee_amounts', ['levelId']);
    await queryInterface.removeIndex('fee_amounts', ['termId']);
    await queryInterface.removeIndex('fee_amounts', ['academicYearId']);
    await queryInterface.removeColumn('fee_amounts', 'classId');
    await queryInterface.removeColumn('fee_amounts', 'termId');
    await queryInterface.removeColumn('fee_amounts', 'academicYearId');
    await queryInterface.addIndex('fee_amounts', ['levelId', 'feeTypeId'], { unique: true });
    await queryInterface.renameTable('fee_amounts', 'level_fees');
  },
};
