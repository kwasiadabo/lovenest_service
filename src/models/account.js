const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const NORMAL_BALANCES = ['DEBIT', 'CREDIT'];

module.exports = (sequelize, DataTypes) => {
  const Account = sequelize.define('Account', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    code: { type: DataTypes.STRING(10), allowNull: false }, // e.g. "1100", "4000"
    name: { type: DataTypes.STRING(100), allowNull: false },
    type: { type: DataTypes.ENUM(...TYPES), allowNull: false },
    // Stored explicitly (not derived from `type`) so contra accounts are
    // unambiguous — e.g. Accumulated Depreciation is type ASSET but its
    // normal balance is CREDIT, and Discounts & Waivers is type INCOME but
    // its normal balance is DEBIT.
    normalBalance: { type: DataTypes.ENUM(...NORMAL_BALANCES), allowNull: false },
    isContra: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // True only for the GL account backing a CashAccount row — lets
    // Cash Flow Statement generation find every cash/bank/mobile-money
    // account without joining through CashAccount.
    isCashAccount: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Protects auto-posting targets (AR, AP, default income/expense
    // accounts) from deletion — they can only be deactivated, never removed,
    // since the ledger poster hardcodes lookups by code for these.
    isSystemAccount: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    parentAccountId: { type: DataTypes.UUID, allowNull: true },
    description: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'accounts',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'code'] },
    ],
  });

  Account.TYPES = TYPES;
  Account.NORMAL_BALANCES = NORMAL_BALANCES;

  Account.associate = (models) => {
    Account.belongsTo(models.School, { foreignKey: 'schoolId' });
    Account.belongsTo(models.Account, { foreignKey: 'parentAccountId', as: 'parentAccount' });
    Account.hasMany(models.Account, { foreignKey: 'parentAccountId', as: 'childAccounts' });
    Account.hasMany(models.JournalLine, { foreignKey: 'accountId' });
    Account.hasOne(models.CashAccount, { foreignKey: 'accountId' });
  };

  return Account;
};
