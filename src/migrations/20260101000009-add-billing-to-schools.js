'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // The old ENUM('trial','active','suspended') is implemented on SQL
    // Server as a NVARCHAR + an auto-named CHECK constraint, which must be
    // dropped before the column can be altered. SQL Server also rejects
    // DEFAULT inline on ALTER COLUMN, so defaultValue is enforced at the
    // application/model level instead (as it already effectively was).
    const [checkConstraints] = await queryInterface.sequelize.query(`
      SELECT cc.name
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('schools') AND cc.definition LIKE '%status%'
    `);
    for (const { name } of checkConstraints) {
      await queryInterface.sequelize.query(`ALTER TABLE [schools] DROP CONSTRAINT [${name}]`);
    }

    // Switched from ENUM to a plain string so new statuses (e.g. 'pending')
    // can be added later without an ENUM-altering migration.
    await queryInterface.changeColumn('schools', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
    });
    await queryInterface.addColumn('schools', 'planCode', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
    await queryInterface.addColumn('schools', 'subscriptionExpiresAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('schools', 'planCode');
    await queryInterface.removeColumn('schools', 'subscriptionExpiresAt');
    await queryInterface.changeColumn('schools', 'status', {
      type: Sequelize.ENUM('trial', 'active', 'suspended'),
      allowNull: false,
      defaultValue: 'trial',
    });
  },
};
