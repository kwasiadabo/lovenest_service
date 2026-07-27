'use strict';

// Derives a 2-3 char code from a school's name — initials of its words when
// there are at least two, else the first 3 letters of its one word.
function baseCodeFor(name) {
  const words = String(name || 'School')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const base = words.length >= 2
    ? words.slice(0, 3).map((w) => w[0].toUpperCase()).join('')
    : (words[0] || 'SC').slice(0, 3).toUpperCase();
  return base.length < 2 ? base.padEnd(2, 'X') : base;
}

// Existing schools were never asked to pick a short code, so collisions
// between two schools deriving the same initials are expected — fall back to
// a shorter prefix + digit suffix (still within the 2-3 char budget) rather
// than silently dropping one school's code.
function uniqueCodeFor(name, usedCodes) {
  const base = baseCodeFor(name);
  if (!usedCodes.has(base)) return base;

  const prefix2 = base.slice(0, 2);
  for (let i = 1; i <= 9; i += 1) {
    const candidate = `${prefix2}${i}`;
    if (!usedCodes.has(candidate)) return candidate;
  }

  const prefix1 = base.slice(0, 1);
  for (let i = 10; i <= 99; i += 1) {
    const candidate = `${prefix1}${i}`;
    if (!usedCodes.has(candidate)) return candidate;
  }

  throw new Error(`Could not derive a unique 2-3 char code for school "${name}"`);
}

// School.code's unique constraint was created via `unique: true` on the
// column at createTable time, so MSSQL auto-named it (e.g.
// "UQ__schools__357D4CF97D92B84C") — that name isn't predictable across
// environments. SQL Server also refuses ALTER COLUMN while any index still
// references the column, so it has to be found and dropped first; the index
// re-added afterward gets an explicit, stable name instead.
async function dropUniqueIndexOnColumn(queryInterface, Sequelize, table, column) {
  const rows = await queryInterface.sequelize.query(`
    SELECT i.name AS indexName, i.is_unique_constraint AS isUniqueConstraint
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID(:table) AND c.name = :column AND i.is_unique = 1
  `, { replacements: { table, column }, type: Sequelize.QueryTypes.SELECT });

  for (const row of rows) {
    const ddl = row.isUniqueConstraint
      ? `ALTER TABLE [${table}] DROP CONSTRAINT [${row.indexName}]`
      : `DROP INDEX [${row.indexName}] ON [${table}]`;
    // eslint-disable-next-line no-await-in-loop
    await queryInterface.sequelize.query(ddl);
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const schools = await queryInterface.sequelize.query(
      'SELECT id, name, code FROM schools',
      { type: Sequelize.QueryTypes.SELECT },
    );

    const usedCodes = new Set();
    const updates = [];

    // A school whose existing code already happens to fit (2-3 alphanumeric
    // chars, not yet claimed by an earlier row in this pass) keeps it, so
    // schools that already look right aren't churned for no reason.
    for (const school of schools) {
      const existing = String(school.code || '').trim().toUpperCase();
      const code = /^[A-Z0-9]{2,3}$/.test(existing) && !usedCodes.has(existing)
        ? existing
        : uniqueCodeFor(school.name, usedCodes);
      usedCodes.add(code);
      updates.push({ id: school.id, code });
    }

    for (const { id, code } of updates) {
      // eslint-disable-next-line no-await-in-loop
      await queryInterface.sequelize.query(
        'UPDATE schools SET code = :code WHERE id = :id',
        { replacements: { code, id } },
      );
    }

    await dropUniqueIndexOnColumn(queryInterface, Sequelize, 'schools', 'code');
    await queryInterface.changeColumn('schools', 'code', { type: Sequelize.STRING(3), allowNull: false });
    await queryInterface.addIndex('schools', ['code'], { unique: true, name: 'schools_code_unique' });
  },
  // Original (longer) codes aren't recoverable once overwritten above, so
  // this only reverts the column's shape, not the historical values.
  down: async (queryInterface, Sequelize) => {
    await dropUniqueIndexOnColumn(queryInterface, Sequelize, 'schools', 'code');
    await queryInterface.changeColumn('schools', 'code', { type: Sequelize.STRING(20), allowNull: false });
    await queryInterface.addIndex('schools', ['code'], { unique: true, name: 'schools_code_unique' });
  },
};
