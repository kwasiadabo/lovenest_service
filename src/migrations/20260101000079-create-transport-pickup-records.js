'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('transport_pickup_records', {
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
      status: { type: Sequelize.ENUM('PICKED_UP', 'MISSED'), allowNull: false },
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
    await queryInterface.addIndex('transport_pickup_records', ['schoolId']);
    await queryInterface.addIndex('transport_pickup_records', ['vehicleId', 'date']);
    // A student has at most one active vehicle assignment (student_transport
    // is unique per student), so one pickup record per student per day is
    // enough — same reasoning attendance_records applies to its own
    // unique(studentId, date).
    await queryInterface.addIndex('transport_pickup_records', ['studentId', 'date'], { unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('transport_pickup_records');
  },
};
