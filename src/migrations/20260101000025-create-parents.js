'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('parents', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      fullName: { type: Sequelize.STRING, allowNull: false },
      phone: { type: Sequelize.STRING(30), allowNull: false },
      email: { type: Sequelize.STRING, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('parents', ['schoolId']);
    await queryInterface.addIndex('parents', ['schoolId', 'phone'], { unique: true });

    await queryInterface.createTable('student_parents', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION (not CASCADE) on studentId/parentId — schoolId already
      // cascades from School, and SQL Server rejects a second cascade path
      // to the same root table (see student_class_assignments migration).
      studentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      parentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'parents', key: 'id' },
        onDelete: 'NO ACTION',
      },
      relationship: { type: Sequelize.ENUM('FATHER', 'MOTHER'), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('student_parents', ['schoolId']);
    await queryInterface.addIndex('student_parents', ['schoolId', 'parentId']);
    await queryInterface.addIndex('student_parents', ['studentId', 'relationship'], { unique: true });

    await queryInterface.removeColumn('students', 'fatherName');
    await queryInterface.removeColumn('students', 'fatherPhone');
    await queryInterface.removeColumn('students', 'fatherEmail');
    await queryInterface.removeColumn('students', 'motherName');
    await queryInterface.removeColumn('students', 'motherPhone');
    await queryInterface.removeColumn('students', 'motherEmail');
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('students', 'fatherName', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('students', 'fatherPhone', { type: Sequelize.STRING(30), allowNull: true });
    await queryInterface.addColumn('students', 'fatherEmail', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('students', 'motherName', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('students', 'motherPhone', { type: Sequelize.STRING(30), allowNull: true });
    await queryInterface.addColumn('students', 'motherEmail', { type: Sequelize.STRING, allowNull: true });

    await queryInterface.dropTable('student_parents');
    await queryInterface.dropTable('parents');
  },
};
