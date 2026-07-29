'use strict';

// Distinguishes a morning pickup run from an afternoon drop-off run — same
// VehicleTrip/live-location mechanism either way, just different alert
// wording (see transport/notify.js#notifyTripStarted) and a label parents
// can see. STRING rather than ENUM, same reasoning as StudentTransport.status
// (see that model's comment) — SQL Server's ENUM-as-CHECK-constraint makes a
// value set that might grow again awkward to migrate.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('vehicle_trips', 'tripType', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'PICKUP',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('vehicle_trips', 'tripType');
  },
};
