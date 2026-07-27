'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('vehicles', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      registrationNumber: { type: Sequelize.STRING(30), allowNull: false },
      capacity: { type: Sequelize.INTEGER, allowNull: false },
      driverStaffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('vehicles', ['schoolId']);
    await queryInterface.addIndex('vehicles', ['schoolId', 'name'], { unique: true });
    await queryInterface.addIndex('vehicles', ['schoolId', 'registrationNumber'], { unique: true });

    await queryInterface.createTable('student_transport', {
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
      vehicleId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vehicles', key: 'id' },
        onDelete: 'NO ACTION',
      },
      status: { type: Sequelize.ENUM('ENROLLED', 'WITHDRAWN'), allowNull: false, defaultValue: 'ENROLLED' },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: true },
      notes: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('student_transport', ['schoolId']);
    await queryInterface.addIndex('student_transport', ['vehicleId']);
    // One transport record per student — reassigning to a different vehicle
    // updates this row rather than creating a second one (mirrors
    // subject_teachers' one-row-per-classId+subjectId upsert convention).
    await queryInterface.addIndex('student_transport', ['schoolId', 'studentId'], { unique: true });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('student_transport');
    await queryInterface.dropTable('vehicles');
  },
};
