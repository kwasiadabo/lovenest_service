const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const AdmissionPayment = sequelize.define('AdmissionPayment', {
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
    // Which named cash/bank/mobile-money account received this payment —
    // the GL posting's debit side. Nullable only for pre-ledger historical
    // rows; every new payment is required (by students/validators.js) to
    // supply one.
    cashAccountId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'admission_payments',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['studentId'] },
    ],
  });

  AdmissionPayment.METHODS = METHODS;

  AdmissionPayment.associate = (models) => {
    AdmissionPayment.belongsTo(models.School, { foreignKey: 'schoolId' });
    AdmissionPayment.belongsTo(models.Student, { foreignKey: 'studentId' });
    AdmissionPayment.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    AdmissionPayment.hasMany(models.AdmissionPaymentItem, { foreignKey: 'admissionPaymentId', as: 'items' });
  };

  return AdmissionPayment;
};
