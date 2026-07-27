'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('classes', 'classTeacherId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'staff', key: 'id' },
      // NO ACTION, not CASCADE/SET NULL: schoolId's cascade already deletes a
      // school's classes directly, and SQL Server rejects a second cascade
      // path to the same root (schools -> staff -> classes).
      onDelete: 'NO ACTION',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('classes', 'classTeacherId');
  },
};
