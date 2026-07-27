const SOURCE_TYPES = [
  'BILL_CONFIRMATION', 'BILL_PAYMENT', 'ADMISSION_PAYMENT', 'LEVY_PAYMENT',
  'EXPENSE_APPROVAL', 'EXPENSE_PAYMENT', 'CASH_TRANSFER', 'PAYROLL_ACCRUAL',
  'PAYROLL_PAYMENT', 'STATUTORY_REMITTANCE', 'ASSET_PURCHASE', 'DEPRECIATION',
  'ASSET_DISPOSAL', 'MANUAL', 'OPENING_BALANCE', 'PERIOD_CLOSE',
  'TRANSPORT_INVOICE', 'TRANSPORT_PAYMENT',
  'PETTY_CASH_DISBURSEMENT', 'PETTY_CASH_REPLENISHMENT',
  'BANK_DEPOSIT', 'BANK_WITHDRAWAL',
];
const STATUSES = ['POSTED', 'REVERSED'];

module.exports = (sequelize, DataTypes) => {
  const JournalEntry = sequelize.define('JournalEntry', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    // Sequential per school, e.g. "JE-000001" — same generation pattern as
    // BillPayment.receiptNumber (see accounting/ledgerPoster.js).
    entryNumber: { type: DataTypes.STRING(30), allowNull: false },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false },
    sourceType: { type: DataTypes.ENUM(...SOURCE_TYPES), allowNull: false },
    // Deliberately NOT a DB-level FK — polymorphic across many source
    // tables (Bill, BillPayment, LevyPayment, ExpenseRequest, PayrollRun,
    // FixedAsset, DepreciationEntry, CashTransfer, AcademicYear), or null
    // for MANUAL/OPENING_BALANCE entries with no natural source row. Stays
    // valid for audit/drill-down even after a source row is deleted.
    sourceId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'POSTED' },
    // Set only on the *reversing* entry, pointing back at the original.
    reversalOfEntryId: { type: DataTypes.UUID, allowNull: true },
    // Denormalized for fast period filtering on statements — resolved at
    // posting time from entryDate, never user-chosen independently.
    academicYearId: { type: DataTypes.UUID, allowNull: true },
    termId: { type: DataTypes.UUID, allowNull: true },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
    postedAt: { type: DataTypes.DATE, allowNull: false },
  }, {
    tableName: 'journal_entries',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'sourceType', 'sourceId'] },
      { fields: ['schoolId', 'entryDate'] },
      { unique: true, fields: ['schoolId', 'entryNumber'] },
    ],
  });

  JournalEntry.SOURCE_TYPES = SOURCE_TYPES;
  JournalEntry.STATUSES = STATUSES;

  JournalEntry.associate = (models) => {
    JournalEntry.belongsTo(models.School, { foreignKey: 'schoolId' });
    JournalEntry.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    JournalEntry.belongsTo(models.Term, { foreignKey: 'termId' });
    JournalEntry.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    JournalEntry.belongsTo(models.JournalEntry, { foreignKey: 'reversalOfEntryId', as: 'reversalOf' });
    JournalEntry.hasMany(models.JournalLine, { foreignKey: 'journalEntryId', as: 'lines' });
  };

  return JournalEntry;
};
