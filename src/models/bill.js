const STATUSES = ['PROVISIONAL', 'CONFIRMED'];
const BILLING_CYCLES = ['TERMLY', 'MONTHLY'];

module.exports = (sequelize, DataTypes) => {
  const Bill = sequelize.define('Bill', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    academicYearId: { type: DataTypes.UUID, allowNull: false },
    // Null for MONTHLY bills — see periodMonth/periodYear below. Mirrors
    // transport_invoices' termId/periodMonth split.
    termId: { type: DataTypes.UUID, allowNull: true },
    billingCycle: { type: DataTypes.ENUM(...BILLING_CYCLES), allowNull: false, defaultValue: 'TERMLY' },
    periodMonth: { type: DataTypes.INTEGER, allowNull: true }, // 1-12, set when billingCycle = MONTHLY
    periodYear: { type: DataTypes.INTEGER, allowNull: true }, // set when billingCycle = MONTHLY
    // Dedupe/uniqueness key so generation is idempotent: the termId for
    // TERMLY, or "YYYY-MM" for MONTHLY. A real column rather than relying on
    // termId being null in a unique index — SQL Server's unique index
    // disallows more than one NULL, unlike Postgres.
    periodKey: { type: DataTypes.STRING(40), allowNull: false },
    periodLabel: { type: DataTypes.STRING(60), allowNull: false }, // e.g. "Term 2 (2025/2026)" or "March 2026"
    dueDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PROVISIONAL' },
    totalPesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    confirmedByUserId: { type: DataTypes.UUID, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'bills',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['studentId'] },
      { fields: ['termId'] },
      { fields: ['status'] },
      { unique: true, fields: ['studentId', 'periodKey'] },
    ],
  });

  Bill.STATUSES = STATUSES;
  Bill.BILLING_CYCLES = BILLING_CYCLES;

  Bill.associate = (models) => {
    Bill.belongsTo(models.School, { foreignKey: 'schoolId' });
    Bill.belongsTo(models.Student, { foreignKey: 'studentId' });
    Bill.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    Bill.belongsTo(models.Term, { foreignKey: 'termId' });
    Bill.belongsTo(models.User, { foreignKey: 'confirmedByUserId', as: 'confirmedBy' });
    Bill.hasMany(models.BillItem, { foreignKey: 'billId', as: 'items' });
  };

  return Bill;
};
