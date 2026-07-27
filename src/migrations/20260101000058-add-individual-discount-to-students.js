'use strict';

// A discount set for one specific student (e.g. staff-child concession,
// hardship case) — either a percentage or a flat cedis amount off their TERM
// fees, applied automatically in financials/service.js#syncStudentDiscount
// whenever bills are (re)generated for them. All nullable: no discount by
// default. When set, it overrides (not stacks with) the sibling discount for
// that student — see syncStudentDiscount for the precedence.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('students', 'individualDiscountType', {
      type: Sequelize.STRING(10), allowNull: true,
    });
    await queryInterface.addColumn('students', 'individualDiscountPercent', {
      type: Sequelize.DECIMAL(5, 2), allowNull: true,
    });
    await queryInterface.addColumn('students', 'individualDiscountFlatPesewas', {
      type: Sequelize.INTEGER, allowNull: true,
    });
    await queryInterface.addColumn('students', 'individualDiscountReason', {
      type: Sequelize.STRING(200), allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('students', 'individualDiscountReason');
    await queryInterface.removeColumn('students', 'individualDiscountFlatPesewas');
    await queryInterface.removeColumn('students', 'individualDiscountPercent');
    await queryInterface.removeColumn('students', 'individualDiscountType');
  },
};
