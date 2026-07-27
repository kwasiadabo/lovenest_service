/**
 * One-time backfill for schools created before the accounting subsystem
 * shipped — onboarding/service.js and platform/service.js only seed a
 * Chart of Accounts for *new* schools going forward. Idempotent: skips any
 * school that already has at least one Account row.
 *
 * Usage: node scripts/seedChartOfAccountsForExistingSchools.js
 */
require('dotenv').config();
const { sequelize, School, Account } = require('../src/models');
const { seedDefaultChartOfAccounts } = require('../src/utils/defaultChartOfAccounts');

async function main() {
  await sequelize.authenticate();

  const schools = await School.findAll();
  let seeded = 0;
  for (const school of schools) {
    const existingCount = await Account.count({ where: { schoolId: school.id } });
    if (existingCount > 0) {
      console.log(`Skipping ${school.name} (${school.id}) — already has ${existingCount} accounts`);
      continue;
    }
    await sequelize.transaction((t) => seedDefaultChartOfAccounts(Account, school.id, t));
    console.log(`Seeded Chart of Accounts for ${school.name} (${school.id})`);
    seeded += 1;
  }

  console.log(`Done. Seeded ${seeded}/${schools.length} school(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
