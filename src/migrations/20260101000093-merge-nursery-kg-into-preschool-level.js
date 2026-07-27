'use strict';

// Supersedes 20260101000090/92's approach (two separate Level rows renamed
// to "Pre-school 1"/"Pre-school 2", with classes numbered across both) —
// the actual requirement is ONE merged "Pre-school" Level containing
// properly-named Nursery/Kindergarten classes underneath it, not two
// parallel levels.
//
// Every school's fixed NURSERY level row is kept (renamed to "Pre-school")
// as the survivor; the KG level row is merged into it and deleted. Category
// codes are untouched (the survivor keeps category='NURSERY'), so
// reportCards/service.js#isEarlyYearsCategory's `=== 'NURSERY' || === 'KG'`
// check still passes for every class here without any code change.
//
// The one real risk merging two levels: FeeAmount rows are looked up by
// (academicYearId, termId, levelId, feeTypeId) with an in-app class-beats-
// level-default precedence (financials/service.js#resolveAmount) — Nursery
// and KG commonly have *different* fee amounts today. Naively repointing
// both levels' fee rows at one survivor would silently collide two
// "level default" (classId IS NULL) rows for the same scope, and
// `resolveAmount`'s `.find()` would then depend on undefined row order.
// Fixed by converting every KG level-default fee row into explicit
// per-class override rows (one per KG class, classId set) before merging —
// resolveAmount's existing class-beats-level-default precedence then keeps
// former-KG classes billing at the KG amount and former-Nursery classes
// (and any future class added to the merged level) at the Nursery default,
// with zero fee amounts lost or misapplied.
module.exports = {
  up: async (queryInterface) => {
    const [schools] = await queryInterface.sequelize.query('SELECT id FROM schools');

    for (const school of schools) {
      // eslint-disable-next-line no-await-in-loop
      const [levels] = await queryInterface.sequelize.query(
        "SELECT id, category FROM levels WHERE schoolId = :schoolId AND category IN ('NURSERY', 'KG')",
        { replacements: { schoolId: school.id } },
      );
      const nurseryLevel = levels.find((l) => l.category === 'NURSERY');
      const kgLevel = levels.find((l) => l.category === 'KG');
      if (!nurseryLevel || !kgLevel) continue; // already merged, or this school never had both

      const survivingId = nurseryLevel.id;
      const kgId = kgLevel.id;

      // Rename classes back to proper Nursery/Kindergarten names, per
      // category, numbered in their existing name order — done before any
      // reassignment while levelId still tells us which category each class
      // was originally under.
      // eslint-disable-next-line no-await-in-loop
      const [nurseryClasses] = await queryInterface.sequelize.query(
        'SELECT id FROM classes WHERE levelId = :survivingId ORDER BY name',
        { replacements: { survivingId } },
      );
      // eslint-disable-next-line no-await-in-loop
      for (let i = 0; i < nurseryClasses.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.sequelize.query(
          'UPDATE classes SET name = :name WHERE id = :id',
          { replacements: { name: `Nursery ${i + 1}`, id: nurseryClasses[i].id } },
        );
      }
      // eslint-disable-next-line no-await-in-loop
      const [kgClasses] = await queryInterface.sequelize.query(
        'SELECT id FROM classes WHERE levelId = :kgId ORDER BY name',
        { replacements: { kgId } },
      );
      // eslint-disable-next-line no-await-in-loop
      for (let i = 0; i < kgClasses.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.sequelize.query(
          'UPDATE classes SET name = :name WHERE id = :id',
          { replacements: { name: `KG ${i + 1}`, id: kgClasses[i].id } },
        );
      }

      // Convert KG's level-wide default fee rows (classId IS NULL) into
      // explicit per-class overrides for every KG class, before the levels
      // merge — see the file-level comment for why.
      // eslint-disable-next-line no-await-in-loop
      const [kgLevelDefaults] = await queryInterface.sequelize.query(
        `SELECT id, schoolId, academicYearId, termId, feeTypeId, amountPesewas
         FROM fee_amounts WHERE levelId = :kgId AND classId IS NULL`,
        { replacements: { kgId } },
      );
      // eslint-disable-next-line no-await-in-loop
      for (const row of kgLevelDefaults) {
        // eslint-disable-next-line no-await-in-loop
        for (const kgClass of kgClasses) {
          // eslint-disable-next-line no-await-in-loop
          await queryInterface.sequelize.query(
            `INSERT INTO fee_amounts (id, schoolId, academicYearId, termId, levelId, classId, feeTypeId, amountPesewas, createdAt, updatedAt)
             VALUES (NEWID(), :schoolId, :academicYearId, :termId, :survivingId, :classId, :feeTypeId, :amountPesewas, GETDATE(), GETDATE())`,
            {
              replacements: {
                schoolId: row.schoolId,
                academicYearId: row.academicYearId,
                termId: row.termId,
                survivingId,
                classId: kgClass.id,
                feeTypeId: row.feeTypeId,
                amountPesewas: row.amountPesewas,
              },
            },
          );
        }
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.sequelize.query('DELETE FROM fee_amounts WHERE id = :id', { replacements: { id: row.id } });
      }
      // KG fee rows that were already class-scoped just move to the survivor.
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        'UPDATE fee_amounts SET levelId = :survivingId WHERE levelId = :kgId AND classId IS NOT NULL',
        { replacements: { survivingId, kgId } },
      );

      // Reassign classes and activities off the KG level, then rename the
      // survivor and drop the now-empty KG level row.
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        'UPDATE classes SET levelId = :survivingId WHERE levelId = :kgId',
        { replacements: { survivingId, kgId } },
      );
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        'UPDATE activities SET levelId = :survivingId WHERE levelId = :kgId',
        { replacements: { survivingId, kgId } },
      );
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        "UPDATE levels SET name = 'Pre-school' WHERE id = :survivingId",
        { replacements: { survivingId } },
      );
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query('DELETE FROM levels WHERE id = :kgId', { replacements: { kgId } });
    }
  },

  down: async () => {
    // Not reversed — splitting the merged level back into two, and
    // un-collapsing the per-class fee overrides back into a level-wide KG
    // default, isn't recoverable from the merged state alone (same
    // "documented, not attempted" precedent as 20260101000092's down()).
  },
};
