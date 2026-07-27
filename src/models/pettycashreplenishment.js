module.exports = (sequelize, DataTypes) => {
  const PettyCashReplenishment = sequelize.define('PettyCashReplenishment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    pettyCashFundId: { type: DataTypes.UUID, allowNull: false },
    replenishmentDate: { type: DataTypes.DATEONLY, allowNull: false },
    sourceCashAccountId: { type: DataTypes.UUID, allowNull: false },
    // Always equal to the sum of the vouchers it reimburses — never
    // independently entered (see pettyCash/service.js#recordReplenishment).
    totalAmountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    reference: { type: DataTypes.STRING(100), allowNull: true },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'petty_cash_replenishments',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['pettyCashFundId'] },
    ],
  });

  PettyCashReplenishment.associate = (models) => {
    PettyCashReplenishment.belongsTo(models.School, { foreignKey: 'schoolId' });
    PettyCashReplenishment.belongsTo(models.PettyCashFund, { foreignKey: 'pettyCashFundId', as: 'fund' });
    PettyCashReplenishment.belongsTo(models.CashAccount, { foreignKey: 'sourceCashAccountId', as: 'sourceCashAccount' });
    PettyCashReplenishment.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
    PettyCashReplenishment.hasMany(models.PettyCashVoucher, { foreignKey: 'replenishmentId', as: 'vouchers' });
  };

  return PettyCashReplenishment;
};
