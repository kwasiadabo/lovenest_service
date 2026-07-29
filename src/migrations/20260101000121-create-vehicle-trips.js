'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('vehicle_trips', {
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
      driverStaffId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      status: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'ACTIVE' },
      startedAt: { type: Sequelize.DATE, allowNull: false },
      endedAt: { type: Sequelize.DATE, allowNull: true },
      lastLatitude: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      lastLongitude: { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      lastPingAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('vehicle_trips', ['schoolId']);
    await queryInterface.addIndex('vehicle_trips', ['vehicleId']);
    // Enforced in transport/service.js#startTrip (checked-then-created,
    // same convention as the rest of this codebase's single-active-row
    // guards e.g. StudentTransport) — not a DB-level partial unique index,
    // since SQL Server (this app's target, see tedious in package.json)
    // doesn't support a filtered unique constraint via this migration API.
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('vehicle_trips');
  },
};
