module.exports = (sequelize, DataTypes) => {
  const TransportPaymentRevision = sequelize.define('TransportPaymentRevision', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    transportPaymentId: { type: DataTypes.UUID, allowNull: false },
    changedByUserId: { type: DataTypes.UUID, allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    // JSON-serialized { amountPesewas, method, paidDate, reference, notes }
    // snapshots — TEXT, same convention as BillPaymentRevision.
    previousValues: { type: DataTypes.TEXT, allowNull: false },
    newValues: { type: DataTypes.TEXT, allowNull: false },
  }, {
    tableName: 'transport_payment_revisions',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['transportPaymentId'] },
    ],
  });

  TransportPaymentRevision.associate = (models) => {
    TransportPaymentRevision.belongsTo(models.School, { foreignKey: 'schoolId' });
    TransportPaymentRevision.belongsTo(models.TransportPayment, { foreignKey: 'transportPaymentId' });
    TransportPaymentRevision.belongsTo(models.User, { foreignKey: 'changedByUserId', as: 'changedBy' });
  };

  return TransportPaymentRevision;
};
