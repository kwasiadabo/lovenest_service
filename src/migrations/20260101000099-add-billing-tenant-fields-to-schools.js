'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'studentPopulation', {
      type: Sequelize.INTEGER,
      // Backfilled with 0 for any pre-existing rows so the NOT NULL
      // constraint can be added in the same migration; every new school
      // going forward supplies a real figure at onboarding.
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.changeColumn('schools', 'studentPopulation', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    await queryInterface.addColumn('schools', 'smsAllowance', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('schools', 'smsUsedThisCycle', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('schools', 'statusReason', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
    await queryInterface.addColumn('schools', 'statusChangedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('schools', 'statusChangedByUserId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.addColumn('schools', 'reminder14SentAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('schools', 'reminder3SentAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'reminder3SentAt');
    await queryInterface.removeColumn('schools', 'reminder14SentAt');
    await queryInterface.removeColumn('schools', 'statusChangedByUserId');
    await queryInterface.removeColumn('schools', 'statusChangedAt');
    await queryInterface.removeColumn('schools', 'statusReason');
    await queryInterface.removeColumn('schools', 'smsUsedThisCycle');
    await queryInterface.removeColumn('schools', 'smsAllowance');
    await queryInterface.removeColumn('schools', 'studentPopulation');
  },
};
