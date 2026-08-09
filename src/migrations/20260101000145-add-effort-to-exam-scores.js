'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('exam_scores', 'effort', {
      type: Sequelize.STRING(2),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('exam_scores', 'effort');
  },
};
