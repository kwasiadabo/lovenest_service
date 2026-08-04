const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const request = require('supertest');
const { Op } = require('sequelize');
const {
  School, User, Role, Account, CashAccount,
} = require('../../src/models');
const { seedDefaultChartOfAccounts } = require('../../src/utils/defaultChartOfAccounts');

// Every fixture this suite creates is unmistakably marked so it can be
// found and torn down even after a crashed run — see tests/setup/env.js for
// why tests run against the dev database instead of an isolated one.
const TEST_SCHOOL_NAME_PREFIX = '[TEST-AUTOMATED]';
const TEST_EMAIL_DOMAIN = 'vx-test.invalid';
const TEST_PASSWORD = 'TestPass123!';

// Low cost factor — these are correctness tests for the auth flow (bcrypt.
// compare works the same regardless of the rounds used to hash), not a
// benchmark of bcrypt itself, and 12 rounds per fixture adds up fast across
// a whole suite.
const TEST_BCRYPT_ROUNDS = 4;

const roleCache = new Map();
async function getRole(name) {
  if (!roleCache.has(name)) {
    const role = await Role.findOne({ where: { name } });
    if (!role) throw new Error(`Role "${name}" is not seeded in this database — run the roles seeder first`);
    roleCache.set(name, role);
  }
  return roleCache.get(name);
}

function randomTestCode() {
  // 'Z' + 2 random alphanumerics — School.code is a 2-3 char unique slug
  // derived from real school names; this range is vanishingly unlikely to
  // collide with one.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const pick = () => chars[Math.floor(Math.random() * chars.length)];
  return `Z${pick()}${pick()}`;
}

// Creates a School + one admin User (default role SCHOOL_ADMIN) directly via
// the models — fast, bypasses HTTP, for test setup. Returns everything a
// test typically needs: the School/User instances, plus the admin's raw
// email/password for logging in through the real /auth/login endpoint when
// a test needs a genuine JWT (see loginAs below).
async function createTestSchool({
  status = 'active', roleName = 'SCHOOL_ADMIN', studentPopulation = 50, schoolOverrides = {},
} = {}) {
  const role = await getRole(roleName);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, TEST_BCRYPT_ROUNDS);

  let school;
  for (let attempt = 0; attempt < 5 && !school; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      school = await School.create({
        name: `${TEST_SCHOOL_NAME_PREFIX} ${randomUUID()}`,
        code: randomTestCode(),
        status,
        studentPopulation,
        ...schoolOverrides,
      });
    } catch (err) {
      if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    }
  }
  if (!school) throw new Error('Could not allocate a unique test school code after 5 attempts');

  const adminEmail = `test-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
  const adminUser = await User.create({
    schoolId: school.id, email: adminEmail, passwordHash, status: 'active',
  });
  await adminUser.addRole(role);

  return {
    school, adminUser, adminEmail, adminPassword: TEST_PASSWORD,
  };
}

// Seeds the real default chart of accounts (same utility real school
// provisioning uses — keeps this in sync with production rather than
// hand-maintaining a duplicate account list) and returns a CashAccount
// pointing at the seeded '1000' Petty Cash account, ready to use as
// cashAccountId on any payment-recording call in tests.
async function createTestCashAccount(schoolId) {
  await seedDefaultChartOfAccounts(Account, schoolId);
  const pettyCash = await Account.findOne({ where: { schoolId, code: '1000' } });
  return CashAccount.create({
    schoolId, name: 'Test Petty Cash', accountId: pettyCash.id, kind: 'CASH',
  });
}

// A real HTTP login through the actual endpoint (not a shortcut) — for
// tests that need a genuine, fully-issued JWT rather than one hand-signed
// via jwt.js directly.
async function loginAs(app, email, password = TEST_PASSWORD) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body; // { accessToken, refreshToken, user }
}

// Destroys a School row — every schoolId-scoped child table cascades via
// onDelete: CASCADE (see migrations), so this is sufficient to fully clean
// up everything a test created under createTestSchool.
async function cleanupSchool(schoolId) {
  if (!schoolId) return;
  await School.destroy({ where: { id: schoolId } });
}

// Sweeps up any TEST_SCHOOL_NAME_PREFIX-marked school left behind by a
// previous crashed/interrupted run, so garbage doesn't accumulate in the
// dev database over repeated test runs. Run once, in globalSetup.
async function cleanupOrphanedTestSchools() {
  const orphans = await School.findAll({
    where: { name: { [Op.like]: `${TEST_SCHOOL_NAME_PREFIX}%` } },
  });
  for (const school of orphans) {
    // eslint-disable-next-line no-await-in-loop
    await school.destroy();
  }
  return orphans.length;
}

module.exports = {
  TEST_SCHOOL_NAME_PREFIX,
  TEST_EMAIL_DOMAIN,
  TEST_PASSWORD,
  createTestSchool,
  createTestCashAccount,
  loginAs,
  cleanupSchool,
  cleanupOrphanedTestSchools,
};
