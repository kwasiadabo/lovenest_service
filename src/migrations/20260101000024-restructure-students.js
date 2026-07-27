'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Table has no rows yet (feature is unreleased), so the required columns
    // can go straight to NOT NULL instead of the usual nullable-then-backfill dance.
    await queryInterface.addColumn('students', 'firstName', { type: Sequelize.STRING, allowNull: false });
    await queryInterface.addColumn('students', 'middleName', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('students', 'lastName', { type: Sequelize.STRING, allowNull: false });
    await queryInterface.addColumn('students', 'allergies', { type: Sequelize.STRING(500), allowNull: true });

    await queryInterface.addColumn('students', 'fatherName', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('students', 'fatherPhone', { type: Sequelize.STRING(30), allowNull: true });
    await queryInterface.addColumn('students', 'fatherEmail', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('students', 'motherName', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('students', 'motherPhone', { type: Sequelize.STRING(30), allowNull: true });
    await queryInterface.addColumn('students', 'motherEmail', { type: Sequelize.STRING, allowNull: true });

    await queryInterface.addColumn('students', 'emergencyContactName', { type: Sequelize.STRING, allowNull: false });
    await queryInterface.addColumn('students', 'emergencyContactPhone', { type: Sequelize.STRING(30), allowNull: false });
    await queryInterface.addColumn('students', 'emergencyContactRelationship', { type: Sequelize.STRING(50), allowNull: true });

    await queryInterface.removeColumn('students', 'fullName');
    await queryInterface.removeColumn('students', 'guardianName');
    await queryInterface.removeColumn('students', 'guardianPhone');
    await queryInterface.removeColumn('students', 'guardianEmail');
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('students', 'fullName', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('students', 'guardianName', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('students', 'guardianPhone', { type: Sequelize.STRING(30), allowNull: true });
    await queryInterface.addColumn('students', 'guardianEmail', { type: Sequelize.STRING, allowNull: true });

    await queryInterface.removeColumn('students', 'firstName');
    await queryInterface.removeColumn('students', 'middleName');
    await queryInterface.removeColumn('students', 'lastName');
    await queryInterface.removeColumn('students', 'allergies');
    await queryInterface.removeColumn('students', 'fatherName');
    await queryInterface.removeColumn('students', 'fatherPhone');
    await queryInterface.removeColumn('students', 'fatherEmail');
    await queryInterface.removeColumn('students', 'motherName');
    await queryInterface.removeColumn('students', 'motherPhone');
    await queryInterface.removeColumn('students', 'motherEmail');
    await queryInterface.removeColumn('students', 'emergencyContactName');
    await queryInterface.removeColumn('students', 'emergencyContactPhone');
    await queryInterface.removeColumn('students', 'emergencyContactRelationship');
  },
};
