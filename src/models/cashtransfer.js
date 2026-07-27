module.exports = (sequelize, DataTypes) => {
  const CashTransfer = sequelize.define('CashTransfer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    fromCashAccountId: { type: DataTypes.UUID, allowNull: false },
    toCashAccountId: { type: DataTypes.UUID, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    transferDate: { type: DataTypes.DATEONLY, allowNull: false },
    reference: { type: DataTypes.STRING(100), allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'cash_transfers',
    indexes: [
      { fields: ['schoolId'] },
    ],
  });

  CashTransfer.associate = (models) => {
    CashTransfer.belongsTo(models.School, { foreignKey: 'schoolId' });
    CashTransfer.belongsTo(models.CashAccount, { foreignKey: 'fromCashAccountId', as: 'fromCashAccount' });
    CashTransfer.belongsTo(models.CashAccount, { foreignKey: 'toCashAccountId', as: 'toCashAccount' });
    CashTransfer.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
  };

  return CashTransfer;
};
