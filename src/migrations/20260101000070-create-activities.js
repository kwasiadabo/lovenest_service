'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('activities', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table.
      levelId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'levels', key: 'id' },
        onDelete: 'NO ACTION',
      },
      domain: { type: Sequelize.STRING(100), allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: true },
      sequenceOrder: { type: Sequelize.INTEGER, allowNull: false },
      createdByStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('activities', ['schoolId']);
    await queryInterface.addIndex(
      'activities',
      ['schoolId', 'levelId', 'domain', 'name'],
      { unique: true, name: 'activities_unique_scope' },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('activities');
  },
};
