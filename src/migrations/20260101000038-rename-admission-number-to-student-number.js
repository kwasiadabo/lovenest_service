'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.removeIndex('students', ['schoolId', 'admissionNumber']);
    await queryInterface.renameColumn('students', 'admissionNumber', 'studentNumber');
    await queryInterface.addIndex('students', ['schoolId', 'studentNumber'], { unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('students', ['schoolId', 'studentNumber']);
    await queryInterface.renameColumn('students', 'studentNumber', 'admissionNumber');
    await queryInterface.addIndex('students', ['schoolId', 'admissionNumber'], { unique: true });
  },
};
