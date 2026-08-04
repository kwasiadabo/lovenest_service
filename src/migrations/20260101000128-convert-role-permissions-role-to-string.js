'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Same reasoning/pattern as 20260101000117-convert-levy-target-type-to-
    // string.js: the ENUM is a NVARCHAR + auto-named CHECK constraint on SQL
    // Server, which must be dropped before the column can be altered.
    // Switched to a plain string so a school-defined custom role name
    // doesn't need another ENUM-altering migration every time one's added.
    const [checkConstraints] = await queryInterface.sequelize.query(`
      SELECT cc.name
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('role_permissions') AND cc.definition LIKE '%role%'
    `);
    for (const { name } of checkConstraints) {
      await queryInterface.sequelize.query(`ALTER TABLE [role_permissions] DROP CONSTRAINT [${name}]`);
    }

    // The unique (schoolId, role, moduleKey) index also depends on the
    // column — drop it, alter the column, then recreate the exact same
    // index (same name, so the model's index declaration still matches it).
    await queryInterface.removeIndex('role_permissions', 'role_permissions_unique_scope');

    await queryInterface.changeColumn('role_permissions', 'role', {
      type: Sequelize.STRING(50),
      allowNull: false,
    });

    await queryInterface.addIndex(
      'role_permissions',
      ['schoolId', 'role', 'moduleKey'],
      { unique: true, name: 'role_permissions_unique_scope' },
    );
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('role_permissions', 'role_permissions_unique_scope');
    await queryInterface.changeColumn('role_permissions', 'role', {
      type: Sequelize.ENUM('ADMINISTRATOR', 'HEAD_TEACHER', 'TEACHER', 'ACCOUNTANT', 'DRIVER'),
      allowNull: false,
    });
    await queryInterface.addIndex(
      'role_permissions',
      ['schoolId', 'role', 'moduleKey'],
      { unique: true, name: 'role_permissions_unique_scope' },
    );
  },
};
