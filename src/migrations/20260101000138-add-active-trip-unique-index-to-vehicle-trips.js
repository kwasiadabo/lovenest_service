'use strict';

// Backs "one ACTIVE trip per vehicle" with a real DB constraint — until now
// this was only enforced by transport/service.js#startTrip's check-then-create
// (see that migration's own comment on 20260101000121-create-vehicle-trips.js),
// which has a race window: a double-tap or a retry after a flaky connection
// can slip both requests past the check and create two ACTIVE trips, firing
// the "bus has set off" parent alert twice. Filtered unique index, same
// raw-SQL approach as 20260101000051-add-user-id-to-parents.js (SQL Server
// supports a WHERE-filtered unique index; Sequelize's addIndex helper just
// doesn't expose it, hence the raw query).
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE NONCLUSTERED INDEX vehicle_trips_active_unique
      ON vehicle_trips(vehicleId) WHERE status = 'ACTIVE'
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP INDEX vehicle_trips_active_unique ON vehicle_trips');
  },
};
