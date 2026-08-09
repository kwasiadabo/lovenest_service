'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('staff_leave_requests', {
      id: {
        type: Sequelize.UUID, primaryKey: true, allowNull: false,
      },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School (same
      // convention as staff_documents.staffId / staff_appraisals.staffId).
      staffId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // LEAVE = away from work entirely for the date range (leaveType then
      // says why). DUTY_EXCUSE = still at work, just asking off a specific
      // roster duty for that date — deliberately not linked to a DutyRoster
      // row (free-text date+reason only), so leaveType stays null for these.
      requestType: { type: Sequelize.ENUM('LEAVE', 'DUTY_EXCUSE'), allowNull: false },
      leaveType: {
        type: Sequelize.ENUM('ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'PERSONAL', 'UNPAID', 'OTHER'),
        allowNull: true,
      },
      startDate: { type: Sequelize.DATEONLY, allowNull: false },
      endDate: { type: Sequelize.DATEONLY, allowNull: false },
      reason: { type: Sequelize.STRING(1000), allowNull: false },
      status: { type: Sequelize.ENUM('PENDING', 'APPROVED', 'DENIED'), allowNull: false, defaultValue: 'PENDING' },
      requestedByUserId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      decidedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      decidedAt: { type: Sequelize.DATE, allowNull: true },
      decisionNotes: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('staff_leave_requests', ['schoolId']);
    await queryInterface.addIndex('staff_leave_requests', ['schoolId', 'staffId']);
    await queryInterface.addIndex('staff_leave_requests', ['schoolId', 'status']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('staff_leave_requests');
  },
};
