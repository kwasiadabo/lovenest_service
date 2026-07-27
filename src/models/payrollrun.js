const STATUSES = ['DRAFT', 'APPROVED', 'PAID'];

module.exports = (sequelize, DataTypes) => {
  const PayrollRun = sequelize.define('PayrollRun', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    // The real pay period — monthly by nature in Ghana, deliberately NOT
    // forced into Term boundaries.
    payPeriodStart: { type: DataTypes.DATEONLY, allowNull: false },
    payPeriodEnd: { type: DataTypes.DATEONLY, allowNull: false },
    payPeriodLabel: { type: DataTypes.STRING(20), allowNull: false }, // e.g. "July 2026"
    // Auto-resolved from payPeriodEnd falling inside a Term's date range —
    // for GL/statement grouping only, never user-chosen as "the payroll
    // period" itself (see payroll/service.js#resolvePeriod).
    academicYearId: { type: DataTypes.UUID, allowNull: true },
    termId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'DRAFT' },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
    approvedByUserId: { type: DataTypes.UUID, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    paidByUserId: { type: DataTypes.UUID, allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    // Set only once paid — which cash/bank account the net pay went out of.
    cashAccountId: { type: DataTypes.UUID, allowNull: true },
    totalGrossPesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    totalPayePesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    totalSsnitEmployeePesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    totalSsnitEmployerPesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    totalOtherDeductionsPesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    totalNetPesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'payroll_runs',
    indexes: [
      { fields: ['schoolId'] },
    ],
  });

  PayrollRun.STATUSES = STATUSES;

  PayrollRun.associate = (models) => {
    PayrollRun.belongsTo(models.School, { foreignKey: 'schoolId' });
    PayrollRun.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    PayrollRun.belongsTo(models.Term, { foreignKey: 'termId' });
    PayrollRun.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    PayrollRun.belongsTo(models.User, { foreignKey: 'approvedByUserId', as: 'approvedBy' });
    PayrollRun.belongsTo(models.User, { foreignKey: 'paidByUserId', as: 'paidBy' });
    PayrollRun.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    PayrollRun.hasMany(models.Payslip, { foreignKey: 'payrollRunId', as: 'payslips' });
    PayrollRun.hasMany(models.StatutoryRemittance, { foreignKey: 'payrollRunId', as: 'statutoryRemittances' });
  };

  return PayrollRun;
};
