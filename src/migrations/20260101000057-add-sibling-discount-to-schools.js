'use strict';

// Sibling discount on TERM fees: the 3rd active child in a family (siblings
// sharing a Parent record) gets thirdChildDiscountPercent off, and every 4th+
// child gets fourthChildAndAboveDiscountPercent off instead. Both default to
// 0 (no discount) so every existing school's billing behavior is unchanged
// until an admin opts in via Settings.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'thirdChildDiscountPercent', {
      type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0,
    });
    await queryInterface.addColumn('schools', 'fourthChildAndAboveDiscountPercent', {
      type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'fourthChildAndAboveDiscountPercent');
    await queryInterface.removeColumn('schools', 'thirdChildDiscountPercent');
  },
};
