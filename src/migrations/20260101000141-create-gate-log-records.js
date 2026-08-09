'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('gate_log_records', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },

      checkedInAt: { type: Sequelize.DATE, allowNull: true },
      checkedInByName: { type: Sequelize.STRING(150), allowNull: true },
      checkedInByRelationship: { type: Sequelize.STRING(50), allowNull: true },
      recordedInByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },

      checkedOutAt: { type: Sequelize.DATE, allowNull: true },
      checkedOutByType: { type: Sequelize.STRING(20), allowNull: true },
      checkedOutByParentId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'parents', key: 'id' },
        onDelete: 'NO ACTION',
      },
      checkedOutByAuthorizedPersonId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'authorized_pickup_persons', key: 'id' },
        onDelete: 'NO ACTION',
      },
      checkedOutByName: { type: Sequelize.STRING(150), allowNull: true },
      checkedOutByRelationship: { type: Sequelize.STRING(50), allowNull: true },
      wasUnauthorizedPickup: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      recordedOutByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },

      alertSentAt: { type: Sequelize.DATE, allowNull: true },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('gate_log_records', ['schoolId']);
    await queryInterface.addIndex('gate_log_records', ['studentId', 'date'], { unique: true, name: 'gate_log_records_unique_student_date' });
    await queryInterface.addIndex('gate_log_records', ['schoolId', 'date']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('gate_log_records');
  },
};
