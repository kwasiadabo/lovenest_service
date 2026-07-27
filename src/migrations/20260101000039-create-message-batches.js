'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('message_batches', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — schoolId already cascades from School, and
      // SQL Server rejects a second cascade path to the same root table.
      sentByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      audience: { type: Sequelize.ENUM('PARENTS', 'TEACHERS'), allowNull: false },
      source: { type: Sequelize.ENUM('COMPOSE', 'DEBT_REMINDER'), allowNull: false },
      smsRequested: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      emailRequested: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      subject: { type: Sequelize.STRING(200), allowNull: true },
      messageTemplate: { type: Sequelize.TEXT, allowNull: false },
      recipientCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      smsAttempted: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      smsSent: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      smsFailed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      emailAttempted: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      emailSent: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      emailFailed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      skippedNoContact: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('message_batches', ['schoolId']);
    await queryInterface.addIndex('message_batches', ['schoolId', 'createdAt']);

    await queryInterface.createTable('message_recipients', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      // NO ACTION, not CASCADE — message_batches itself already cascades
      // from schools, so a CASCADE here would give SQL Server two cascade
      // paths down to schools (direct via schoolId, indirect via
      // batchId -> message_batches), which it rejects at CREATE TABLE time.
      // A batch's recipient rows are cleaned up by the app, not the DB.
      batchId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'message_batches', key: 'id' },
        onDelete: 'NO ACTION',
      },
      recipientType: { type: Sequelize.ENUM('PARENT', 'STAFF'), allowNull: false },
      parentId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'parents', key: 'id' },
        onDelete: 'NO ACTION',
      },
      staffId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // Set only for DEBT_REMINDER rows — which child this parent was
      // reminded about, so a parent with two debtor children has one
      // traceable row per child rather than one shared/ambiguous row.
      studentId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'students', key: 'id' },
        onDelete: 'NO ACTION',
      },
      // Denormalized snapshots — survive later edits/deletes to the source
      // Parent/Staff record, so the audit trail always reflects what was
      // actually sent, not whatever the record looks like today.
      recipientName: { type: Sequelize.STRING, allowNull: false },
      phoneUsed: { type: Sequelize.STRING(30), allowNull: true },
      emailUsed: { type: Sequelize.STRING, allowNull: true },
      smsStatus: { type: Sequelize.ENUM('NOT_APPLICABLE', 'SENT', 'FAILED'), allowNull: false, defaultValue: 'NOT_APPLICABLE' },
      smsError: { type: Sequelize.STRING(500), allowNull: true },
      emailStatus: { type: Sequelize.ENUM('NOT_APPLICABLE', 'SENT', 'FAILED'), allowNull: false, defaultValue: 'NOT_APPLICABLE' },
      emailError: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('message_recipients', ['schoolId']);
    await queryInterface.addIndex('message_recipients', ['batchId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('message_recipients');
    await queryInterface.dropTable('message_batches');
  },
};
