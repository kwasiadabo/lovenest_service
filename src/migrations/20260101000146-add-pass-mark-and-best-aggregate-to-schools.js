'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'passMarkPercent', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('schools', 'bestAggregateSubjectCount', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 6,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'passMarkPercent');
    await queryInterface.removeColumn('schools', 'bestAggregateSubjectCount');
  },
};
