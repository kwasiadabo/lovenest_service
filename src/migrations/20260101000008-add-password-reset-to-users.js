'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'resetPasswordTokenHash', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'resetPasswordExpiresAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex('users', ['resetPasswordTokenHash']);
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('users', ['resetPasswordTokenHash']);
    await queryInterface.removeColumn('users', 'resetPasswordTokenHash');
    await queryInterface.removeColumn('users', 'resetPasswordExpiresAt');
  },
};
