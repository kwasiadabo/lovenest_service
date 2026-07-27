module.exports = (sequelize, DataTypes) => {
  const JournalLine = sequelize.define('JournalLine', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    journalEntryId: { type: DataTypes.UUID, allowNull: false },
    accountId: { type: DataTypes.UUID, allowNull: false },
    // Exactly one of debit/credit is > 0 on any given line — enforced in
    // accounting/ledgerPoster.js, not just here.
    debitPesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    creditPesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    description: { type: DataTypes.STRING(255), allowNull: true },
    // Analysis dimensions for drill-down (e.g. "show all GL lines for this
    // student's fee payments") — optional, not every line has one.
    studentId: { type: DataTypes.UUID, allowNull: true },
    staffId: { type: DataTypes.UUID, allowNull: true },
    lineOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // Bank reconciliation state. bankReconciliationId also doubles as the
    // "tentatively checked off under this in-progress reconciliation"
    // pointer before reconciledAt is stamped at completion — see
    // accounting/service.js#completeBankReconciliation.
    reconciledAt: { type: DataTypes.DATE, allowNull: true },
    bankReconciliationId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'journal_lines',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['journalEntryId'] },
      { fields: ['accountId'] },
      { fields: ['studentId'] },
      { fields: ['staffId'] },
      { fields: ['bankReconciliationId'] },
    ],
  });

  JournalLine.associate = (models) => {
    JournalLine.belongsTo(models.School, { foreignKey: 'schoolId' });
    JournalLine.belongsTo(models.JournalEntry, { foreignKey: 'journalEntryId', as: 'journalEntry' });
    JournalLine.belongsTo(models.Account, { foreignKey: 'accountId', as: 'account' });
    JournalLine.belongsTo(models.Student, { foreignKey: 'studentId' });
    JournalLine.belongsTo(models.Staff, { foreignKey: 'staffId' });
    JournalLine.belongsTo(models.BankReconciliation, { foreignKey: 'bankReconciliationId', as: 'bankReconciliation' });
  };

  return JournalLine;
};
