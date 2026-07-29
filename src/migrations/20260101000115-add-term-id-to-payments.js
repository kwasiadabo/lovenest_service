'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('payments', 'termId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'terms', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.addIndex('payments', ['termId']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('payments', ['termId']);
    await queryInterface.removeColumn('payments', 'termId');
  },
};
