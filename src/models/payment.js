module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    // 'subscription' (default) | 'training' — branches applySuccessfulPayment
    // (billing/service.js) to either activate the subscription plan or mark
    // the one-time TrainingEnrollment paid. planCode still stores a pseudo
    // code ('training_in_person'/'training_online') for training payments,
    // for ledger readability only — never looked up in config/plans.js.
    purpose: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'subscription' },
    planCode: { type: DataTypes.STRING(30), allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    currency: { type: DataTypes.STRING(6), allowNull: false, defaultValue: 'GHS' },
    reference: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    paidAt: DataTypes.DATE,
    rawResponse: DataTypes.TEXT,
    // Which Term this subscription payment settles (see
    // billing/service.js#initializePayment) — null only for a school's very
    // first payment, made before any Term has been configured yet, in which
    // case applySuccessfulPayment falls back to plan.durationDays for
    // expiry instead of a term's endDate. Never set for purpose:'training'.
    termId: { type: DataTypes.UUID, allowNull: true },
    // Only set for purpose: 'fee_payment' — a parent paying a specific
    // child's school-fee balance via parentPortal, as distinct from every
    // other purpose here which is school-level (subscription/training).
    studentId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'payments',
  });

  Payment.associate = (models) => {
    Payment.belongsTo(models.School, { foreignKey: 'schoolId' });
    Payment.belongsTo(models.Term, { foreignKey: 'termId' });
    Payment.belongsTo(models.Student, { foreignKey: 'studentId' });
  };

  return Payment;
};
