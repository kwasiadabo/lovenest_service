'use strict';

// Nullable — existing staff rows predate this field and have no known
// gender to backfill; required going forward only at the create-staff
// validator/form level (see staff/validators.js and StaffPage.jsx).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('staff', 'gender', {
      type: Sequelize.ENUM('MALE', 'FEMALE'),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('staff', 'gender');
  },
};
