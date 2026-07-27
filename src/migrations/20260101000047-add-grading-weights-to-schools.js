'use strict';

// Classwork(CA)/exam split for the gradebook (ExamScore.caScaled/examScaled)
// used to be hardcoded 30/70 in assessment/service.js — now configurable per
// school. DB defaults backfill every existing school to that same 30/70
// behavior with zero extra seeding code.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'caWeight', {
      type: Sequelize.DECIMAL(4, 3), allowNull: false, defaultValue: 0.3,
    });
    await queryInterface.addColumn('schools', 'examWeight', {
      type: Sequelize.DECIMAL(4, 3), allowNull: false, defaultValue: 0.7,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'examWeight');
    await queryInterface.removeColumn('schools', 'caWeight');
  },
};
