module.exports = (sequelize, DataTypes) => {
  const LevyPaymentRevision = sequelize.define('LevyPaymentRevision', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    levyPaymentId: { type: DataTypes.UUID, allowNull: false },
    changedByUserId: { type: DataTypes.UUID, allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    // JSON-serialized { amountPesewas, method, paidDate, reference, notes }
    // snapshots — TEXT, matching BillPaymentRevision's convention.
    previousValues: { type: DataTypes.TEXT, allowNull: false },
    newValues: { type: DataTypes.TEXT, allowNull: false },
  }, {
    tableName: 'levy_payment_revisions',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['levyPaymentId'] },
    ],
  });

  LevyPaymentRevision.associate = (models) => {
    LevyPaymentRevision.belongsTo(models.School, { foreignKey: 'schoolId' });
    LevyPaymentRevision.belongsTo(models.LevyPayment, { foreignKey: 'levyPaymentId' });
    LevyPaymentRevision.belongsTo(models.User, { foreignKey: 'changedByUserId', as: 'changedBy' });
  };

  return LevyPaymentRevision;
};
