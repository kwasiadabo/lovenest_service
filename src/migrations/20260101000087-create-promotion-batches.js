'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('promotion_batches', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      fromAcademicYearId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'academic_years', key: 'id' },
        onDelete: 'NO ACTION',
      },
      toAcademicYearId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'academic_years', key: 'id' },
        onDelete: 'NO ACTION',
      },
      runByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      promotedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      graduatedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      skippedCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('promotion_batches', ['schoolId']);
    await queryInterface.addIndex('promotion_batches', ['fromAcademicYearId']);
    await queryInterface.addIndex('promotion_batches', ['toAcademicYearId']);

    await queryInterface.createTable('promotion_batch_items', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      promotionBatchId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'promotion_batches', key: 'id' },
        onDelete: 'NO ACTION',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      fromClassId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'classes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      toClassId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'classes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      outcome: { type: Sequelize.ENUM('PROMOTED', 'GRADUATED', 'SKIPPED'), allowNull: false },
      skipReason: { type: Sequelize.STRING(200), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('promotion_batch_items', ['schoolId']);
    await queryInterface.addIndex('promotion_batch_items', ['promotionBatchId']);
    await queryInterface.addIndex('promotion_batch_items', ['studentId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('promotion_batch_items');
    await queryInterface.dropTable('promotion_batches');
  },
};
