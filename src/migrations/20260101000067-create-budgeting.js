'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('budgets', {
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
        onDelete: 'NO ACTION',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      status: { type: Sequelize.ENUM('DRAFT', 'APPROVED'), allowNull: false, defaultValue: 'DRAFT' },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      approvedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      approvedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('budgets', ['schoolId']);

    await queryInterface.createTable('budget_lines', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      budgetId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'budgets', key: 'id' },
        onDelete: 'NO ACTION',
      },
      accountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // Null = whole-year line, not scoped to a single term.
      termId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'terms', key: 'id' },
        onDelete: 'NO ACTION',
      },
      budgetedAmountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('budget_lines', ['schoolId']);
    await queryInterface.addIndex('budget_lines', ['budgetId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('budget_lines');
    await queryInterface.dropTable('budgets');
  },
};
