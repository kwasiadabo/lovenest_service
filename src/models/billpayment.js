const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const BillPayment = sequelize.define('BillPayment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    method: { type: DataTypes.ENUM(...METHODS), allowNull: false },
    reference: { type: DataTypes.STRING(100), allowNull: true },
    paidDate: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
    // Sequential per school, e.g. "RCT-000001" — assigned once at creation
    // and never changed, including across edits (see BillPaymentRevision for
    // the edit trail — the receipt itself keeps its original number).
    receiptNumber: { type: DataTypes.STRING(30), allowNull: false },
    // Set only once this payment has been edited at least once.
    lastEditedByUserId: { type: DataTypes.UUID, allowNull: true },
    // Which named cash/bank/mobile-money account received this payment —
    // the GL posting's debit side. Nullable only for pre-ledger historical
    // rows; every new payment is required (by financials/validators.js) to
    // supply one.
    cashAccountId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'bill_payments',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['studentId'] },
      { unique: true, fields: ['schoolId', 'receiptNumber'] },
    ],
  });

  BillPayment.METHODS = METHODS;

  BillPayment.associate = (models) => {
    BillPayment.belongsTo(models.School, { foreignKey: 'schoolId' });
    BillPayment.belongsTo(models.Student, { foreignKey: 'studentId' });
    BillPayment.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
    BillPayment.belongsTo(models.User, { foreignKey: 'lastEditedByUserId', as: 'lastEditedBy' });
    BillPayment.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    BillPayment.hasMany(models.BillPaymentRevision, { foreignKey: 'billPaymentId', as: 'revisions' });
  };

  return BillPayment;
};
