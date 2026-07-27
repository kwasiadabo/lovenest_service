/**
 * One-time data migration: school logos were originally stored on local
 * disk (backend/uploads/logos/<file>, School.logoUrl = "/uploads/logos/...").
 * Uploads now go straight to Cloudinary (see lib/cloudinary.js), matching
 * how student photos already work — this script backfills any existing
 * local-path logos to Cloudinary so every School.logoUrl ends up an
 * absolute https://res.cloudinary.com/... URL.
 *
 * Usage: `node scripts/migrateLogosToCloudinary.js`
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, School } = require('../src/models');
const { uploadImageBuffer } = require('../src/lib/cloudinary');

async function main() {
  await sequelize.authenticate();

  const schools = await School.findAll({
    where: { logoUrl: { [Op.and]: [{ [Op.ne]: null }, { [Op.notLike]: 'http%' }] } },
  });

  console.log(`Found ${schools.length} school(s) with a local logoUrl to migrate.`);

  let migrated = 0;
  let skipped = 0;

  for (const school of schools) {
    const relative = school.logoUrl.replace(/^\/?uploads\//, '');
    const absolute = path.join(__dirname, '../uploads', relative);

    if (!fs.existsSync(absolute)) {
      console.warn(`  SKIP  ${school.name} (${school.id}) — local file missing: ${absolute}`);
      skipped += 1;
      continue;
    }

    const buffer = fs.readFileSync(absolute);
    const result = await uploadImageBuffer(buffer, { folder: 'school-logos' });
    await school.update({ logoUrl: result.secure_url });
    console.log(`  OK    ${school.name} (${school.id}) — ${school.logoUrl} -> ${result.secure_url}`);
    migrated += 1;
  }

  console.log(`\nDone. Migrated ${migrated}, skipped ${skipped}.`);
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
