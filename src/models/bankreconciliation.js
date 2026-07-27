const STATUSES = ['IN_PROGRESS', 'COMPLETED'];

module.exports = (sequelize, DataTypes) => {
  const BankReconciliation = sequelize.define('BankReconciliation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    cashAccountId: { type: DataTypes.UUID, allowNull: false },
    statementDate: { type: DataTypes.DATEONLY, allowNull: false },
    statementEndingBalancePesewas: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'IN_PROGRESS' },
    // Snapshot taken only at completion — not read again after that, mirrors
    // CashAccount.openingBalancePesewas's "recognized once" convention.
    bookBalancePesewas: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    preparedByUserId: { type: DataTypes.UUID, allowNull: true },
    completedByUserId: { type: DataTypes.UUID, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'bank_reconciliations',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['cashAccountId'] },
    ],
  });

  BankReconciliation.STATUSES = STATUSES;

  BankReconciliation.associate = (models) => {
    BankReconciliation.belongsTo(models.School, { foreignKey: 'schoolId' });
    BankReconciliation.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    BankReconciliation.belongsTo(models.User, { foreignKey: 'preparedByUserId', as: 'preparedBy' });
    BankReconciliation.belongsTo(models.User, { foreignKey: 'completedByUserId', as: 'completedBy' });
    BankReconciliation.hasMany(models.JournalLine, { foreignKey: 'bankReconciliationId', as: 'clearedLines' });
  };

  return BankReconciliation;
};
