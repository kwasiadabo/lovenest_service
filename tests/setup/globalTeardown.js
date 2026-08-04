require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.DB_NAME_TEST = process.env.DB_NAME;

// Belt-and-braces final sweep — each test file's own afterAll already
// cleans up what it created, but if a suite crashed mid-run this catches
// anything it left behind, same as globalSetup's pre-run sweep.
module.exports = async function globalTeardown() {
  // eslint-disable-next-line global-require
  const { sequelize } = require('../../src/models');
  // eslint-disable-next-line global-require
  const { cleanupOrphanedTestSchools } = require('../helpers/testFixtures');

  const removed = await cleanupOrphanedTestSchools();
  if (removed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[globalTeardown] Cleaned up ${removed} leftover test school(s).`);
  }

  await sequelize.close();
};
