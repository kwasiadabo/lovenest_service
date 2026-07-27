'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('bill_payments', 'lastEditedByUserId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'NO ACTION',
    });
    await queryInterface.addColumn('bill_payments', 'supersedesReceiptNumber', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });

    await queryInterface.createTable('bill_payment_revisions', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      schoolId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'schools', key: 'id' },
        onDelete: 'CASCADE',
      },
      billPaymentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'bill_payments', key: 'id' },
        onDelete: 'NO ACTION',
      },
      changedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'NO ACTION',
      },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      previousValues: { type: Sequelize.TEXT, allowNull: false },
      newValues: { type: Sequelize.TEXT, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('bill_payment_revisions', ['schoolId']);
    await queryInterface.addIndex('bill_payment_revisions', ['billPaymentId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('bill_payment_revisions');
    await queryInterface.removeColumn('bill_payments', 'supersedesReceiptNumber');
    await queryInterface.removeColumn('bill_payments', 'lastEditedByUserId');
  },
};
