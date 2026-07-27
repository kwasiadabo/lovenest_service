'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Nullable at the DB level, same as fee_amounts.academicYearId (see
    // 20260101000031) — a transport invoice is logically always tied to an
    // academic year, but a school with zero configured academic years must
    // not be blocked from invoicing.
    await queryInterface.addColumn('transport_invoices', 'academicYearId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'academic_years', key: 'id' },
      onDelete: 'NO ACTION',
    });

    // Backfill existing rows.
    // Pass 1: TERMLY invoices — derive from the term they already point at.
    await queryInterface.sequelize.query(`
      UPDATE ti
      SET ti.academicYearId = t.academicYearId
      FROM transport_invoices ti
      INNER JOIN terms t ON t.id = ti.termId
      WHERE ti.academicYearId IS NULL AND ti.termId IS NOT NULL
    `);
    // Pass 2: MONTHLY invoices — the academic year whose date range contains
    // the invoice's due date.
    await queryInterface.sequelize.query(`
      UPDATE ti
      SET ti.academicYearId = ay.id
      FROM transport_invoices ti
      INNER JOIN academic_years ay
        ON ay.schoolId = ti.schoolId AND ti.dueDate BETWEEN ay.startDate AND ay.endDate
      WHERE ti.academicYearId IS NULL
    `);
    // Pass 3: anything still unmatched (due date outside every configured
    // year's range) — fall back to the school's current academic year.
    await queryInterface.sequelize.query(`
      UPDATE ti
      SET ti.academicYearId = ay.id
      FROM transport_invoices ti
      INNER JOIN academic_years ay ON ay.schoolId = ti.schoolId AND ay.isCurrent = 1
      WHERE ti.academicYearId IS NULL
    `);
    // Rows for schools with zero academic years stay NULL — nothing is
    // deleted, they just won't show up in a year-scoped filter.

    await queryInterface.addIndex('transport_invoices', ['academicYearId']);
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('transport_invoices', ['academicYearId']);
    await queryInterface.removeColumn('transport_invoices', 'academicYearId');
  },
};
