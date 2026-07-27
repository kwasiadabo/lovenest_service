const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const TransportPayment = sequelize.define('TransportPayment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    transportInvoiceId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    method: { type: DataTypes.ENUM(...METHODS), allowNull: false },
    reference: { type: DataTypes.STRING(100), allowNull: true },
    paidDate: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
    // Sequential per school, e.g. "TRN-000001" — distinct prefix from bill
    // ("RCT-") and levy ("LVY-") receipts, same convention.
    receiptNumber: { type: DataTypes.STRING(30), allowNull: false },
    lastEditedByUserId: { type: DataTypes.UUID, allowNull: true },
    cashAccountId: { type: DataTypes.UUID, allowNull: false },
  }, {
    tableName: 'transport_payments',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['transportInvoiceId'] },
      { fields: ['studentId'] },
      { unique: true, fields: ['schoolId', 'receiptNumber'] },
    ],
  });

  TransportPayment.METHODS = METHODS;

  TransportPayment.associate = (models) => {
    TransportPayment.belongsTo(models.School, { foreignKey: 'schoolId' });
    TransportPayment.belongsTo(models.TransportInvoice, { foreignKey: 'transportInvoiceId' });
    TransportPayment.belongsTo(models.Student, { foreignKey: 'studentId' });
    TransportPayment.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
    TransportPayment.belongsTo(models.User, { foreignKey: 'lastEditedByUserId', as: 'lastEditedBy' });
    TransportPayment.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    TransportPayment.hasMany(models.TransportPaymentRevision, { foreignKey: 'transportPaymentId', as: 'revisions' });
  };

  return TransportPayment;
};
