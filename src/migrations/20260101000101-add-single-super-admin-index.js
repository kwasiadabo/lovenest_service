'use strict';

// Defense in depth: users.schoolId IS NULL is exclusively the platform
// SUPER_ADMIN marker (see middleware/auth.js's documented invariant). No
// application code path can currently produce a second such row —
// users/service.js#createUser always goes through tenantScopedModel.js,
// which throws if schoolId is falsy — but a filtered unique index makes it
// impossible at the database layer too, regardless of future code changes.
// SQL Server (this backend's dialect) treats NULL as a value for plain
// UNIQUE constraints and only allows a single NULL row anyway, but a
// filtered index makes the intent explicit and self-documenting.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE NONCLUSTERED INDEX idx_single_platform_admin ON users(schoolId) WHERE schoolId IS NULL
    `);
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP INDEX idx_single_platform_admin ON users');
  },
};
