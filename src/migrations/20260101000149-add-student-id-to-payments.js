'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('payments', 'studentId', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addIndex('payments', ['schoolId', 'studentId']);
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('payments', ['schoolId', 'studentId']);
    await queryInterface.removeColumn('payments', 'studentId');
  },
};
