'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('transport_routes', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      vehicleId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vehicles', key: 'id' },
        onDelete: 'NO ACTION',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('transport_routes', ['schoolId']);
    await queryInterface.addIndex('transport_routes', ['vehicleId']);
    await queryInterface.addIndex('transport_routes', ['schoolId', 'name'], { unique: true });

    await queryInterface.createTable('transport_pickup_points', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      routeId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'transport_routes', key: 'id' },
        onDelete: 'NO ACTION',
      },
      name: { type: Sequelize.STRING(150), allowNull: false },
      // "HH:MM" 24h string, same convention as timetable_periods'
      // startTime/endTime — avoids cross-dialect TIME-column quirks.
      scheduledTime: { type: Sequelize.STRING(5), allowNull: false },
      sequenceOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('transport_pickup_points', ['schoolId']);
    await queryInterface.addIndex('transport_pickup_points', ['routeId']);
    await queryInterface.addIndex('transport_pickup_points', ['routeId', 'name'], { unique: true });

    // Which stop a student boards at — nullable, since a school may run
    // transport without recording per-student pickup points at all.
    await queryInterface.addColumn('student_transport', 'pickupPointId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'transport_pickup_points', key: 'id' },
      onDelete: 'NO ACTION',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('student_transport', 'pickupPointId');
    await queryInterface.dropTable('transport_pickup_points');
    await queryInterface.dropTable('transport_routes');
  },
};
