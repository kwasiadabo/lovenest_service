const TYPES = ['DEPOSIT', 'WITHDRAWAL'];
const STATUSES = ['ACTIVE', 'VOIDED'];

module.exports = (sequelize, DataTypes) => {
  const BankTransaction = sequelize.define('BankTransaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    cashAccountId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM(...TYPES), allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    transactionDate: { type: DataTypes.DATEONLY, allowNull: false },
    // The other side of the posting (e.g. Cash on Hand, an Income/Expense
    // account) — never an isCashAccount account, see accounting/service.js.
    contraAccountId: { type: DataTypes.UUID, allowNull: false },
    counterparty: { type: DataTypes.STRING(150), allowNull: true },
    reference: { type: DataTypes.STRING(100), allowNull: true },
    // Optional, withdrawal-only in practice (see accounting/service.js) —
    // not every withdrawal is by cheque.
    chequeNumber: { type: DataTypes.STRING(50), allowNull: true },
    chequeDate: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
    voidedByUserId: { type: DataTypes.UUID, allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidReason: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'bank_transactions',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['cashAccountId'] },
    ],
  });

  BankTransaction.TYPES = TYPES;
  BankTransaction.STATUSES = STATUSES;

  BankTransaction.associate = (models) => {
    BankTransaction.belongsTo(models.School, { foreignKey: 'schoolId' });
    BankTransaction.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    BankTransaction.belongsTo(models.Account, { foreignKey: 'contraAccountId', as: 'contraAccount' });
    BankTransaction.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
    BankTransaction.belongsTo(models.User, { foreignKey: 'voidedByUserId', as: 'voidedBy' });
  };

  return BankTransaction;
};
