const BILLING_CYCLES = ['TERMLY', 'MONTHLY'];

module.exports = (sequelize, DataTypes) => {
  const TransportInvoice = sequelize.define('TransportInvoice', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentTransportId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    // Snapshot of the vehicle at generation time — a later reassignment to a
    // different vehicle must not rewrite which vehicle this period's charge
    // was actually for.
    vehicleId: { type: DataTypes.UUID, allowNull: false },
    billingCycle: { type: DataTypes.ENUM(...BILLING_CYCLES), allowNull: false },
    termId: { type: DataTypes.UUID, allowNull: true }, // set when billingCycle = TERMLY
    // Set for both cycles — TERMLY takes it from the term, MONTHLY resolves
    // it from the due date against each academic year's date range. Nullable
    // because a school with no academic years configured yet can still bill.
    academicYearId: { type: DataTypes.UUID, allowNull: true },
    periodMonth: { type: DataTypes.INTEGER, allowNull: true }, // 1-12, set when MONTHLY
    periodYear: { type: DataTypes.INTEGER, allowNull: true }, // set when MONTHLY
    // Dedupe key so generation is idempotent: the termId for TERMLY, or
    // "YYYY-MM" for MONTHLY. A real column rather than relying on termId/
    // periodMonth being null in a unique index — SQL Server's unique index
    // disallows more than one NULL, unlike Postgres.
    periodKey: { type: DataTypes.STRING(40), allowNull: false },
    periodLabel: { type: DataTypes.STRING(60), allowNull: false }, // e.g. "Term 2 (2025/2026)" or "March 2026"
    dueDate: { type: DataTypes.DATEONLY, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'transport_invoices',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['studentId'] },
      { fields: ['termId'] },
      { fields: ['academicYearId'] },
      { unique: true, fields: ['studentTransportId', 'periodKey'] },
    ],
  });

  TransportInvoice.BILLING_CYCLES = BILLING_CYCLES;

  TransportInvoice.associate = (models) => {
    TransportInvoice.belongsTo(models.School, { foreignKey: 'schoolId' });
    TransportInvoice.belongsTo(models.StudentTransport, { foreignKey: 'studentTransportId' });
    TransportInvoice.belongsTo(models.Student, { foreignKey: 'studentId' });
    TransportInvoice.belongsTo(models.Vehicle, { foreignKey: 'vehicleId' });
    TransportInvoice.belongsTo(models.Term, { foreignKey: 'termId' });
    TransportInvoice.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    TransportInvoice.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    TransportInvoice.hasMany(models.TransportPayment, { foreignKey: 'transportInvoiceId', as: 'payments' });
  };

  return TransportInvoice;
};
