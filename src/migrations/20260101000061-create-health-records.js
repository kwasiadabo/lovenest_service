'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('sick_bay_visits', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE',
      },
      studentId: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'NO ACTION',
      },
      visitedAt: { type: Sequelize.DATE, allowNull: false },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      treatmentGiven: { type: Sequelize.STRING(500), allowNull: true },
      outcome: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'RETURNED_TO_CLASS' },
      notes: { type: Sequelize.STRING(1000), allowNull: true },
      recordedByUserId: {
        type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('sick_bay_visits', ['schoolId']);
    await queryInterface.addIndex('sick_bay_visits', ['schoolId', 'studentId']);

    await queryInterface.createTable('medication_logs', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE',
      },
      studentId: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'NO ACTION',
      },
      administeredAt: { type: Sequelize.DATE, allowNull: false },
      medicationName: { type: Sequelize.STRING(150), allowNull: false },
      dosage: { type: Sequelize.STRING(100), allowNull: false },
      reason: { type: Sequelize.STRING(300), allowNull: true },
      notes: { type: Sequelize.STRING(1000), allowNull: true },
      administeredByUserId: {
        type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('medication_logs', ['schoolId']);
    await queryInterface.addIndex('medication_logs', ['schoolId', 'studentId']);

    await queryInterface.createTable('immunizations', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE',
      },
      studentId: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'NO ACTION',
      },
      vaccine: { type: Sequelize.STRING(30), allowNull: false },
      // Only meaningful when vaccine = 'OTHER'.
      otherVaccineName: { type: Sequelize.STRING(100), allowNull: true },
      doseNumber: { type: Sequelize.STRING(30), allowNull: true },
      administeredDate: { type: Sequelize.DATEONLY, allowNull: false },
      nextDueDate: { type: Sequelize.DATEONLY, allowNull: true },
      notes: { type: Sequelize.STRING(1000), allowNull: true },
      recordedByUserId: {
        type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'NO ACTION',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('immunizations', ['schoolId']);
    await queryInterface.addIndex('immunizations', ['schoolId', 'studentId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('immunizations');
    await queryInterface.dropTable('medication_logs');
    await queryInterface.dropTable('sick_bay_visits');
  },
};
