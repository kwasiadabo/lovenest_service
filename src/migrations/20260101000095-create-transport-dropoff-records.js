'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('transport_dropoff_records', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      vehicleId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vehicles', key: 'id' },
        onDelete: 'NO ACTION',
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      droppedOffAt: { type: Sequelize.DATE, allowNull: false },
      latitude: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      longitude: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      recordedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('transport_dropoff_records', ['schoolId']);
    await queryInterface.addIndex('transport_dropoff_records', ['vehicleId', 'date']);
    await queryInterface.addIndex('transport_dropoff_records', ['studentId', 'date'], { unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('transport_dropoff_records');
  },
};
