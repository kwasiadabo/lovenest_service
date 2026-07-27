module.exports = (sequelize, DataTypes) => {
  const AdmissionPaymentItem = sequelize.define('AdmissionPaymentItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    admissionPaymentId: { type: DataTypes.UUID, allowNull: false },
    feeTypeId: { type: DataTypes.UUID, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    tableName: 'admission_payment_items',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['admissionPaymentId'] },
    ],
  });

  AdmissionPaymentItem.associate = (models) => {
    AdmissionPaymentItem.belongsTo(models.School, { foreignKey: 'schoolId' });
    AdmissionPaymentItem.belongsTo(models.AdmissionPayment, { foreignKey: 'admissionPaymentId' });
    AdmissionPaymentItem.belongsTo(models.FeeType, { foreignKey: 'feeTypeId' });
  };

  return AdmissionPaymentItem;
};
