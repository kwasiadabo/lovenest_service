module.exports = (sequelize, DataTypes) => {
  const BillPaymentRevision = sequelize.define('BillPaymentRevision', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    billPaymentId: { type: DataTypes.UUID, allowNull: false },
    changedByUserId: { type: DataTypes.UUID, allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    // JSON-serialized { amountPesewas, method, paidDate, reference, notes, receiptNumber }
    // snapshots — TEXT rather than DataTypes.JSON, matching this app's existing
    // convention for serialized blobs (see Payment.rawResponse).
    previousValues: { type: DataTypes.TEXT, allowNull: false },
    newValues: { type: DataTypes.TEXT, allowNull: false },
  }, {
    tableName: 'bill_payment_revisions',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['billPaymentId'] },
    ],
  });

  BillPaymentRevision.associate = (models) => {
    BillPaymentRevision.belongsTo(models.School, { foreignKey: 'schoolId' });
    BillPaymentRevision.belongsTo(models.BillPayment, { foreignKey: 'billPaymentId' });
    BillPaymentRevision.belongsTo(models.User, { foreignKey: 'changedByUserId', as: 'changedBy' });
  };

  return BillPaymentRevision;
};
