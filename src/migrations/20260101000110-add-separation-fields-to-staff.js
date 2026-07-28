'use strict';

// Adds a proper separation workflow to Staff — previously the only way a
// staff member stopped appearing was a hard DELETE, which throws away
// history. All nullable/defaulted so existing rows aren't affected.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('staff', 'status', {
      type: Sequelize.ENUM('ACTIVE', 'SEPARATED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    });
    await queryInterface.addColumn('staff', 'separationType', {
      type: Sequelize.ENUM('RESIGNATION', 'TERMINATION', 'RETIREMENT', 'END_OF_CONTRACT'),
      allowNull: true,
    });
    await queryInterface.addColumn('staff', 'separationReason', { type: Sequelize.STRING(500), allowNull: true });
    await queryInterface.addColumn('staff', 'lastWorkingDay', { type: Sequelize.DATEONLY, allowNull: true });
    await queryInterface.addColumn('staff', 'rehireEligible', { type: Sequelize.BOOLEAN, allowNull: true });
    await queryInterface.addIndex('staff', ['schoolId', 'status']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('staff', ['schoolId', 'status']);
    await queryInterface.removeColumn('staff', 'rehireEligible');
    await queryInterface.removeColumn('staff', 'lastWorkingDay');
    await queryInterface.removeColumn('staff', 'separationReason');
    await queryInterface.removeColumn('staff', 'separationType');
    await queryInterface.removeColumn('staff', 'status');
  },
};
