const STATUSES = ['ACTIVE', 'VOIDED'];

module.exports = (sequelize, DataTypes) => {
  const PettyCashVoucher = sequelize.define('PettyCashVoucher', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    pettyCashFundId: { type: DataTypes.UUID, allowNull: false },
    // Sequential per school, e.g. "PCV-000001" — same generation pattern as
    // JournalEntry.entryNumber (see accounting/ledgerPoster.js).
    voucherNumber: { type: DataTypes.STRING(30), allowNull: false },
    voucherDate: { type: DataTypes.DATEONLY, allowNull: false },
    paidTo: { type: DataTypes.STRING(200), allowNull: false },
    purpose: { type: DataTypes.STRING(500), allowNull: false },
    expenseItemId: { type: DataTypes.UUID, allowNull: true },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
    // Set once this voucher is folded into a replenishment — from that point
    // it's locked (see pettyCash/service.js#voidVoucher) rather than editable.
    reimbursedAt: { type: DataTypes.DATE, allowNull: true },
    replenishmentId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'petty_cash_vouchers',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['pettyCashFundId'] },
      { unique: true, fields: ['schoolId', 'voucherNumber'] },
    ],
  });

  PettyCashVoucher.STATUSES = STATUSES;

  PettyCashVoucher.associate = (models) => {
    PettyCashVoucher.belongsTo(models.School, { foreignKey: 'schoolId' });
    PettyCashVoucher.belongsTo(models.PettyCashFund, { foreignKey: 'pettyCashFundId', as: 'fund' });
    PettyCashVoucher.belongsTo(models.ExpenseItem, { foreignKey: 'expenseItemId', as: 'expenseItem' });
    PettyCashVoucher.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
    PettyCashVoucher.belongsTo(models.PettyCashReplenishment, { foreignKey: 'replenishmentId', as: 'replenishment' });
  };

  return PettyCashVoucher;
};
