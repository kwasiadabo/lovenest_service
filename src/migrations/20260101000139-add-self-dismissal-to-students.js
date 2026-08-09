'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('students', 'selfDismissalAuthorized', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('students', 'selfDismissalNote', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
    await queryInterface.addColumn('students', 'selfDismissalSetByUserId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.addColumn('students', 'selfDismissalSetAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('students', 'selfDismissalSetAt');
    await queryInterface.removeColumn('students', 'selfDismissalSetByUserId');
    await queryInterface.removeColumn('students', 'selfDismissalNote');
    await queryInterface.removeColumn('students', 'selfDismissalAuthorized');
  },
};
