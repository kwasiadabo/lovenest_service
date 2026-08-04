// Runs once, in Jest's own orchestration process — NOT the same process as
// the workers that actually run test files, so this needs its own copy of
// the env override (tests/setup/env.js's version isn't visible here).
require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.DB_NAME_TEST = process.env.DB_NAME;

module.exports = async function globalSetup() {
  // eslint-disable-next-line global-require
  const { sequelize, Role } = require('../../src/models');
  // eslint-disable-next-line global-require
  const { cleanupOrphanedTestSchools } = require('../helpers/testFixtures');

  await sequelize.authenticate();

  const roleCount = await Role.count();
  if (roleCount === 0) {
    throw new Error(
      'No roles are seeded in this database — run `npm run seed` before running tests '
      + '(the roles seeder must have run at least once).',
    );
  }

  const removed = await cleanupOrphanedTestSchools();
  if (removed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[globalSetup] Cleaned up ${removed} leftover test school(s) from a previous run.`);
  }

  // Deliberately NOT closing the connection here — globalSetup and
  // globalTeardown share the same Node module cache within one Jest
  // invocation (confirmed empirically), so this is the same Sequelize
  // instance globalTeardown will reuse. Only globalTeardown closes it.
};
