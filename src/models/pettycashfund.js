module.exports = (sequelize, DataTypes) => {
  const PettyCashFund = sequelize.define('PettyCashFund', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'Petty Cash' },
    custodianStaffId: { type: DataTypes.UUID, allowNull: true },
    // The cash bucket this fund draws from/tops up — its live balance (via
    // JournalLine sums, same as every other CashAccount) IS the fund's
    // current float; there is no separately stored balance here.
    cashAccountId: { type: DataTypes.UUID, allowNull: false, unique: true },
    imprestFloatPesewas: { type: DataTypes.INTEGER, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'petty_cash_funds',
    indexes: [
      { unique: true, fields: ['schoolId'] },
    ],
  });

  PettyCashFund.associate = (models) => {
    PettyCashFund.belongsTo(models.School, { foreignKey: 'schoolId' });
    PettyCashFund.belongsTo(models.Staff, { foreignKey: 'custodianStaffId', as: 'custodian' });
    PettyCashFund.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    PettyCashFund.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    PettyCashFund.hasMany(models.PettyCashVoucher, { foreignKey: 'pettyCashFundId', as: 'vouchers' });
    PettyCashFund.hasMany(models.PettyCashReplenishment, { foreignKey: 'pettyCashFundId', as: 'replenishments' });
  };

  return PettyCashFund;
};
