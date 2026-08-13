'use strict';
const { randomUUID } = require('crypto');

// Not per-school — see models/ssnitrate.js. IMPORTANT: verify/update against
// the current SSNIT schedule before relying on this for real payroll; a rate
// change ships as a new row with a fresh effectiveFrom date (see
// modules/payroll/service.js#setSsnitRate), never an edit to this one.
const EFFECTIVE_FROM = '2024-01-01';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert('ssnit_rates', [{
      id: randomUUID(),
      effectiveFrom: EFFECTIVE_FROM,
      employeeRatePercent: 5.5,
      employerRatePercent: 13,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete('ssnit_rates', { effectiveFrom: EFFECTIVE_FROM });
  },
};
