'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('fee_types', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(60), allowNull: false },
      category: {
        type: Sequelize.ENUM('ADMISSION', 'TERM', 'BOOKS', 'UNIFORM', 'OTHER'),
        allowNull: false,
        defaultValue: 'OTHER',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('fee_types', ['schoolId']);
    await queryInterface.addIndex('fee_types', ['schoolId', 'name'], { unique: true });

    await queryInterface.createTable('level_fees', {
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
      feeTypeId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'fee_types', key: 'id' },
        onDelete: 'NO ACTION',
      },
      amountPesewas: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('level_fees', ['schoolId']);
    await queryInterface.addIndex('level_fees', ['levelId', 'feeTypeId'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('level_fees');
    await queryInterface.dropTable('fee_types');
  },
};
