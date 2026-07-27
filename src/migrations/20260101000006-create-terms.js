'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('terms', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      academicYearId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'academic_years', key: 'id' },
        // NO ACTION, not CASCADE: schoolId's cascade already deletes a school's
        // terms directly, and SQL Server rejects a second cascade path to the
        // same root (schools -> academic_years -> terms).
        onDelete: 'NO ACTION',
      },
      name: { type: Sequelize.STRING(20), allowNull: false },
      sequence: { type: Sequelize.INTEGER, allowNull: false },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: false },
      isCurrent: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('terms', ['schoolId', 'academicYearId']);
    await queryInterface.addIndex('terms', ['academicYearId', 'sequence'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('terms');
  },
};
