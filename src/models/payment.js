module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    // Only 'fee_payment' (a parent paying a child's school-fee balance via
    // parentPortal/service.js) is written today — the 'subscription'/
    // 'training' purposes were part of the multi-tenant platform-billing
    // system, since removed. defaultValue is a leftover, always overridden
    // explicitly by every current writer.
    purpose: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'subscription' },
    planCode: { type: DataTypes.STRING(30), allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    currency: { type: DataTypes.STRING(6), allowNull: false, defaultValue: 'GHS' },
    reference: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    paidAt: DataTypes.DATE,
    rawResponse: DataTypes.TEXT,
    // Vestigial: only used by the removed multi-tenant platform-billing
    // system, never set by the current 'fee_payment' writer.
    termId: { type: DataTypes.UUID, allowNull: true },
    // The child whose fee balance this payment settles (every current row
    // is purpose: 'fee_payment', written from parentPortal/service.js).
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
