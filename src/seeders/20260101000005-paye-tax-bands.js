'use strict';
const { randomUUID } = require('crypto');

// Illustrative Ghana Revenue Authority monthly PAYE bands. Platform-level
// (not per-school) — see models/payetaxband.js. IMPORTANT: verify/update
// these against the current GRA schedule before relying on them for real
// payroll; a rate change ships as a new migration/seeder inserting a fresh
// effectiveFrom set, never an edit to these rows.
const EFFECTIVE_FROM = '2024-01-01';
const BANDS = [
  { bandOrder: 1, upToPesewas: 49000, ratePercent: 0 }, // first GHS 490
  { bandOrder: 2, upToPesewas: 11000, ratePercent: 5 }, // next GHS 110
  { bandOrder: 3, upToPesewas: 13000, ratePercent: 10 }, // next GHS 130
  { bandOrder: 4, upToPesewas: 316667, ratePercent: 17.5 }, // next GHS 3,166.67
  { bandOrder: 5, upToPesewas: 1600000, ratePercent: 25 }, // next GHS 16,000
  { bandOrder: 6, upToPesewas: 3052000, ratePercent: 30 }, // next GHS 30,520
  { bandOrder: 7, upToPesewas: null, ratePercent: 35 }, // exceeding GHS 50,416.67
];

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert(
      'paye_tax_bands',
      BANDS.map((band) => ({
        id: randomUUID(),
        effectiveFrom: EFFECTIVE_FROM,
        ...band,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  },
  down: async (queryInterface) => {
    await queryInterface.bulkDelete('paye_tax_bands', { effectiveFrom: EFFECTIVE_FROM });
  },
};
