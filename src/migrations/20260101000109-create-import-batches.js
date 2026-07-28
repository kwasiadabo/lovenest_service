'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('import_batches', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: Sequelize.ENUM('STUDENTS', 'FEE_BALANCES', 'TRANSPORT_SUBSCRIBERS'), allowNull: false },
      status: { type: Sequelize.ENUM('PENDING', 'CONFIRMED', 'CANCELLED'), allowNull: false, defaultValue: 'PENDING' },
      fileName: { type: Sequelize.STRING(255), allowNull: false },
      totalRows: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      validRowCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      errorRowCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      rowsJson: { type: Sequelize.TEXT, allowNull: false },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      confirmedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      confirmedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('import_batches', ['schoolId']);
    await queryInterface.addIndex('import_batches', ['schoolId', 'type']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('import_batches');
  },
};
