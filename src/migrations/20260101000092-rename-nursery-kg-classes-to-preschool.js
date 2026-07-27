'use strict';

// Classes under the NURSERY/KG levels are admin-named per school (unlike
// Level rows, which are fixed platform reference data — see the previous
// migration, 20260101000090) — e.g. "Nursery 1", "Nursery 2", "KG 1". A
// blanket word-swap ("Nursery" -> "Pre-school", "KG" -> "Pre-school") would
// collide: a school with both "Nursery 1" and "KG 1" would end up with two
// classes both named "Pre-school 1", indistinguishable in every dropdown.
// Instead, per school, Nursery classes (in their existing name order) are
// numbered "Pre-school 1", "Pre-school 2", ... first, then KG classes
// continue the same sequence — a single, collision-free numbering across
// both categories, per school.
module.exports = {
  up: async (queryInterface) => {
    const [schools] = await queryInterface.sequelize.query('SELECT id FROM schools');
    for (const school of schools) {
      const [classes] = await queryInterface.sequelize.query(`
        SELECT c.id, c.name, l.category
        FROM classes c
        JOIN levels l ON l.id = c.levelId
        WHERE c.schoolId = :schoolId AND l.category IN ('NURSERY', 'KG')
        ORDER BY CASE l.category WHEN 'NURSERY' THEN 0 ELSE 1 END, c.name
      `, { replacements: { schoolId: school.id } });

      // eslint-disable-next-line no-await-in-loop
      for (let i = 0; i < classes.length; i += 1) {
        const newName = `Pre-school ${i + 1}`;
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.sequelize.query(
          'UPDATE classes SET name = :newName WHERE id = :id',
          { replacements: { newName, id: classes[i].id } },
        );
      }
    }
  },

  down: async () => {
    // Lossy — the original per-category numbering (which class was
    // "Nursery 1" vs "Nursery 2") isn't recoverable from "Pre-school N"
    // alone. Not reversed; re-run the class rename manually if needed.
  },
};
