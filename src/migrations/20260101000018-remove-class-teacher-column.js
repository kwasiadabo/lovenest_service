'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.removeColumn('classes', 'classTeacherId');
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('classes', 'classTeacherId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'staff', key: 'id' },
      onDelete: 'NO ACTION',
    });
  },
};
