'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('role_permissions', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      role: {
        type: Sequelize.ENUM('ADMINISTRATOR', 'HEAD_TEACHER', 'TEACHER', 'ACCOUNTANT', 'DRIVER'),
        allowNull: false,
      },
      // Not an ENUM — the module list lives in config/permissions.js and can
      // grow without a schema migration; validated at the application layer.
      moduleKey: { type: Sequelize.STRING(50), allowNull: false },
      level: {
        type: Sequelize.ENUM('NONE', 'VIEW', 'CONTRIBUTE', 'MANAGE'),
        allowNull: false,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('role_permissions', ['schoolId']);
    await queryInterface.addIndex(
      'role_permissions',
      ['schoolId', 'role', 'moduleKey'],
      { unique: true, name: 'role_permissions_unique_scope' },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('role_permissions');
  },
};
