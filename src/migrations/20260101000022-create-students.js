'use strict';

const STATUSES = ['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED'];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('students', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      admissionNumber: { type: Sequelize.STRING(30), allowNull: false },
      fullName: { type: Sequelize.STRING, allowNull: false },
      gender: { type: Sequelize.ENUM('MALE', 'FEMALE'), allowNull: false },
      dateOfBirth: { type: Sequelize.DATEONLY, allowNull: false },
      guardianName: { type: Sequelize.STRING, allowNull: false },
      guardianPhone: { type: Sequelize.STRING(30), allowNull: false },
      guardianEmail: { type: Sequelize.STRING, allowNull: true },
      address: { type: Sequelize.STRING, allowNull: true },
      admissionDate: { type: Sequelize.DATEONLY, allowNull: false },
      status: { type: Sequelize.ENUM(...STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
      statusDate: { type: Sequelize.DATEONLY, allowNull: true },
      statusNote: { type: Sequelize.STRING, allowNull: true },
      photoUrl: { type: Sequelize.STRING, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('students', ['schoolId']);
    await queryInterface.addIndex('students', ['schoolId', 'status']);
    await queryInterface.addIndex('students', ['schoolId', 'admissionNumber'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('students');
  },
};
