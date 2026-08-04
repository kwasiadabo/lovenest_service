'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // NO ACTION, not CASCADE — SQL Server rejects a second cascade path to
    // the same root table (schools), and roles already reaches it via
    // user_roles -> users -> schools. A school's custom roles are cleaned
    // up in application code instead (modules/roles/service.js#deleteRole
    // already requires them to be unassigned first; school deletion, if
    // ever added, would need to delete its custom roles explicitly too).
    await queryInterface.addColumn('roles', 'schoolId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'schools', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.addIndex('roles', ['schoolId']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('roles', 'schoolId');
  },
};
