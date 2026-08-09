const KINDS = ['CASH', 'BANK', 'MOBILE_MONEY'];

module.exports = (sequelize, DataTypes) => {
  const CashAccount = sequelize.define('CashAccount', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false }, // e.g. "GCB Main Account", "MTN MoMo Merchant"
    accountId: { type: DataTypes.UUID, allowNull: false, unique: true }, // the GL account this posts to
    kind: { type: DataTypes.ENUM(...KINDS), allowNull: false },
    bankName: { type: DataTypes.STRING(100), allowNull: true },
    accountNumber: { type: DataTypes.STRING(50), allowNull: true },
    // Recognized once, at creation, via an OPENING_BALANCE journal entry
    // (Dr this account, Cr Opening Balance Equity) — not read again after
    // that; the running balance is always computed from JournalLine sums.
    openingBalancePesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // The single cash account a parent's online (Paystack) fee payment posts
    // against — resolved by parentPortal/service.js#resolveOnlineCashAccountId.
    // Not DB-enforced as a singleton; the service throws a clean 409 if a
    // school has none set, and callers are expected to set at most one.
    isOnlineDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    tableName: 'cash_accounts',
    indexes: [
      { fields: ['schoolId'] },
    ],
  });

  CashAccount.KINDS = KINDS;

  CashAccount.associate = (models) => {
    CashAccount.belongsTo(models.School, { foreignKey: 'schoolId' });
    CashAccount.belongsTo(models.Account, { foreignKey: 'accountId', as: 'account' });
  };

  return CashAccount;
};
