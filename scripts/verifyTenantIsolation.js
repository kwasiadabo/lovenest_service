/**
 * Standalone check for the core risk of the shared-DB multi-tenancy decision
 * (plan §1): two schools with overlapping data (same academic year name,
 * same level name) must never see each other's rows.
 *
 * Requires a real MSSQL instance reachable via the env vars in .env — run
 * migrations first (`npm run migrate`). Usage: `node scripts/verifyTenantIsolation.js`
 */
require('dotenv').config();
const assert = require('assert');
const {
  sequelize, AcademicYear, Level, School,
} = require('../src/models');
const platformService = require('../src/modules/platform/service');
const academicService = require('../src/modules/academic/service');

async function main() {
  await sequelize.authenticate();

  const suffix = Date.now();
  // School.code is STRING(3) (shortened by the create-schools follow-up
  // migration after this script was originally written) and globally
  // unique across every school ever provisioned, including leftover rows
  // from earlier runs of this script (it doesn't clean up School rows) — a
  // random 3-char code avoids collisions far better than a fixed literal.
  const randomCode = () => Math.random().toString(36).slice(2, 5).toUpperCase();
  // schoolNameGuard.js's fuzzy-similarity check (used by provisionSchool
  // itself) flags near-duplicate names — "Tenant Test School A <suffix>" vs
  // "...School B <suffix>" differ by a single character and were always
  // rejected against each other. Two unrelated words keep the edit distance
  // well above the guard's threshold regardless of shared suffix digits.
  const { school: schoolA } = await platformService.provisionSchool({
    name: `Riverside Isolation Check Academy ${suffix}`,
    code: randomCode(),
    adminEmail: `admin-a-${suffix}@example.com`,
    adminPassword: 'ChangeMe123!',
  });
  const { school: schoolB } = await platformService.provisionSchool({
    name: `Quokka Isolation Verification College ${suffix}`,
    code: randomCode(),
    adminEmail: `admin-b-${suffix}@example.com`,
    adminPassword: 'ChangeMe123!',
  });

  // Deliberately overlapping names — isolation must hold even under collision.
  await academicService.createAcademicYear(schoolA.id, {
    name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', isCurrent: true,
  });
  await academicService.createAcademicYear(schoolB.id, {
    name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', isCurrent: true,
  });
  await academicService.createLevel(schoolA.id, { name: 'Primary 4', category: 'PRIMARY', sequenceOrder: 4 });
  await academicService.createLevel(schoolB.id, { name: 'Primary 4', category: 'PRIMARY', sequenceOrder: 4 });

  const yearsForA = await academicService.listAcademicYears(schoolA.id);
  const yearsForB = await academicService.listAcademicYears(schoolB.id);
  const levelsForA = await academicService.listLevels(schoolA.id);
  const levelsForB = await academicService.listLevels(schoolB.id);

  assert.strictEqual(yearsForA.length, 1, 'School A should see exactly its own academic year');
  assert.strictEqual(yearsForB.length, 1, 'School B should see exactly its own academic year');
  assert.notStrictEqual(yearsForA[0].id, yearsForB[0].id, 'Academic year rows must not be shared');
  assert.strictEqual(levelsForA.length, 1, 'School A should see exactly its own level');
  assert.notStrictEqual(levelsForA[0].id, levelsForB[0].id, 'Level rows must not be shared');

  // Direct model query as a sanity check that the raw data is genuinely
  // scoped, not just filtered by the service layer's return value.
  const crossTenantLeak = await AcademicYear.count({
    where: { schoolId: schoolA.id, id: yearsForB[0].id },
  });
  assert.strictEqual(crossTenantLeak, 0, 'School A must not be able to read School B rows by id');

  await Level.destroy({ where: { schoolId: [schoolA.id, schoolB.id] } });
  await AcademicYear.destroy({ where: { schoolId: [schoolA.id, schoolB.id] } });
  // School.hasMany(User) cascades on delete, so this also removes the two
  // admin Users provisionSchool created — without this, every run left two
  // orphan schools behind, which the name-similarity guard (schoolNameGuard.js)
  // then flagged on the very next run since consecutive Date.now() suffixes
  // are only a few digits apart.
  await School.destroy({ where: { id: [schoolA.id, schoolB.id] } });

  console.log('Tenant isolation check passed: no cross-tenant leakage detected.');
  await sequelize.close();
}

main().catch(async (err) => {
  console.error('Tenant isolation check FAILED:', err);
  await sequelize.close();
  process.exit(1);
});
