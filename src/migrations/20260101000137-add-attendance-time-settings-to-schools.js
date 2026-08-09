'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('schools', 'attendanceReportingTime', {
      type: Sequelize.STRING(5),
      allowNull: false,
      defaultValue: '08:00',
    });
    await queryInterface.addColumn('schools', 'attendanceLatenessCutoffTime', {
      type: Sequelize.STRING(5),
      allowNull: false,
      defaultValue: '08:15',
    });
    await queryInterface.addColumn('schools', 'attendanceAutoAbsentCutoffTime', {
      type: Sequelize.STRING(5),
      allowNull: false,
      defaultValue: '10:00',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('schools', 'attendanceReportingTime');
    await queryInterface.removeColumn('schools', 'attendanceLatenessCutoffTime');
    await queryInterface.removeColumn('schools', 'attendanceAutoAbsentCutoffTime');
  },
};
