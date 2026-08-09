'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('report_cards', 'behaviorProgress', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('report_cards', 'generalComments', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('report_cards', 'learningBehaviourComments', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('report_cards', 'growthMindsetComments', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('report_cards', 'behaviorProgress');
    await queryInterface.removeColumn('report_cards', 'generalComments');
    await queryInterface.removeColumn('report_cards', 'learningBehaviourComments');
    await queryInterface.removeColumn('report_cards', 'growthMindsetComments');
  },
};
