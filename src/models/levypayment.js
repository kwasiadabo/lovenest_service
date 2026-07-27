const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const LevyPayment = sequelize.define('LevyPayment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    levyId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    method: { type: DataTypes.ENUM(...METHODS), allowNull: false },
    reference: { type: DataTypes.STRING(100), allowNull: true },
    paidDate: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
    // Sequential per school, e.g. "LVY-000001" — distinct prefix from bill
    // payments' "RCT-" so a levy receipt is visually distinguishable and the
    // two sequences never collide.
    receiptNumber: { type: DataTypes.STRING(30), allowNull: false },
    lastEditedByUserId: { type: DataTypes.UUID, allowNull: true },
    // Which named cash/bank/mobile-money account received this payment —
    // the GL posting's debit side. Nullable only for pre-ledger historical
    // rows; every new payment is required (by levies/validators.js) to
    // supply one.
    cashAccountId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'levy_payments',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['levyId'] },
      { fields: ['studentId'] },
      { unique: true, fields: ['schoolId', 'receiptNumber'] },
    ],
  });

  LevyPayment.METHODS = METHODS;

  LevyPayment.associate = (models) => {
    LevyPayment.belongsTo(models.School, { foreignKey: 'schoolId' });
    LevyPayment.belongsTo(models.Levy, { foreignKey: 'levyId' });
    LevyPayment.belongsTo(models.Student, { foreignKey: 'studentId' });
    LevyPayment.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
    LevyPayment.belongsTo(models.User, { foreignKey: 'lastEditedByUserId', as: 'lastEditedBy' });
    LevyPayment.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    LevyPayment.hasMany(models.LevyPaymentRevision, { foreignKey: 'levyPaymentId', as: 'revisions' });
  };

  return LevyPayment;
};
