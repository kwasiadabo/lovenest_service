'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('levy_students', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table
      // (same convention as levy_class_amounts.levyId).
      levyId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'levies', key: 'id' },
        onDelete: 'NO ACTION',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('levy_students', ['schoolId']);
    await queryInterface.addIndex('levy_students', ['levyId']);
    await queryInterface.addIndex('levy_students', ['studentId']);
    await queryInterface.addIndex('levy_students', ['levyId', 'studentId'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('levy_students');
  },
};
