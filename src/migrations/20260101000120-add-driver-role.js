'use strict';
const { randomUUID } = require('crypto');

// Adds the DRIVER role introduced by live bus tracking (transport/notify.js
// notifyTripStarted, transport/service.js startTrip/updateTripLocation/
// endTrip) — inserted via migration rather than the roles seeder since that
// seeder has already run on provisioned schools and won't re-run.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert('roles', [{
      id: randomUUID(),
      name: 'DRIVER',
      description: 'Bus/van driver — broadcasts live vehicle location during a trip',
    }]);
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete('roles', { name: 'DRIVER' });
  },
};
