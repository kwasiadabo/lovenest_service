'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('exam_scores', 'status', {
      type: Sequelize.ENUM('DRAFT', 'CONFIRMED'),
      allowNull: false,
      defaultValue: 'DRAFT',
    });
    await queryInterface.addColumn('exam_scores', 'confirmedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // NO ACTION, not CASCADE — schoolId already cascades from School, and
    // SQL Server rejects a second cascade path to the same root table.
    await queryInterface.addColumn('exam_scores', 'confirmedByStaffId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'staff', key: 'id' },
      onDelete: 'NO ACTION',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('exam_scores', 'confirmedByStaffId');
    await queryInterface.removeColumn('exam_scores', 'confirmedAt');
    await queryInterface.removeColumn('exam_scores', 'status');
  },
};
