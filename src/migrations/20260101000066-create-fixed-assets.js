'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('fixed_assets', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      assetCode: { type: Sequelize.STRING(20), allowNull: false },
      name: { type: Sequelize.STRING(150), allowNull: false },
      category: {
        type: Sequelize.ENUM(
          'LAND', 'BUILDING', 'FURNITURE_FIXTURES', 'OFFICE_EQUIPMENT', 'ICT_EQUIPMENT', 'MOTOR_VEHICLE', 'OTHER',
        ),
        allowNull: false,
      },
      acquisitionDate: { type: Sequelize.DATEONLY, allowNull: false },
      costPesewas: { type: Sequelize.INTEGER, allowNull: false },
      residualValuePesewas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Nullable only for LAND, which never depreciates.
      usefulLifeMonths: { type: Sequelize.INTEGER, allowNull: true },
      depreciationMethod: { type: Sequelize.ENUM('STRAIGHT_LINE'), allowNull: false, defaultValue: 'STRAIGHT_LINE' },
      assetAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      accumulatedDepreciationAccountId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      depreciationExpenseAccountId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // Phase 1 requires cash purchase — financed/AP-based acquisition is an
      // explicit, documented limitation, not built now.
      cashAccountId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'cash_accounts', key: 'id' },
        onDelete: 'NO ACTION',
      },
      status: { type: Sequelize.ENUM('ACTIVE', 'DISPOSED'), allowNull: false, defaultValue: 'ACTIVE' },
      disposalDate: { type: Sequelize.DATEONLY, allowNull: true },
      disposalProceedsPesewas: { type: Sequelize.INTEGER, allowNull: true },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('fixed_assets', ['schoolId']);
    await queryInterface.addIndex('fixed_assets', ['schoolId', 'assetCode'], { unique: true });

    await queryInterface.createTable('depreciation_entries', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      fixedAssetId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'fixed_assets', key: 'id' },
        onDelete: 'NO ACTION',
      },
      periodLabel: { type: Sequelize.STRING(20), allowNull: false }, // e.g. "2026-07"
      periodStart: { type: Sequelize.DATEONLY, allowNull: false },
      periodEnd: { type: Sequelize.DATEONLY, allowNull: false },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      runByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('depreciation_entries', ['schoolId']);
    // Prevents double-depreciating the same asset in the same period — the
    // one place a hard DB uniqueness constraint earns its keep, since a
    // re-run bug here would silently overstate expense.
    await queryInterface.addIndex('depreciation_entries', ['fixedAssetId', 'periodLabel'], { unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('depreciation_entries');
    await queryInterface.dropTable('fixed_assets');
  },
};
