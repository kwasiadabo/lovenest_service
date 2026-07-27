module.exports = (sequelize, DataTypes) => {
  const Payslip = sequelize.define('Payslip', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    payrollRunId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
    grossPesewas: { type: DataTypes.INTEGER, allowNull: false },
    payePesewas: { type: DataTypes.INTEGER, allowNull: false },
    ssnitEmployeePesewas: { type: DataTypes.INTEGER, allowNull: false },
    ssnitEmployerPesewas: { type: DataTypes.INTEGER, allowNull: false },
    otherDeductionsPesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    netPesewas: { type: DataTypes.INTEGER, allowNull: false },
    // Component-level detail for the printable payslip — same
    // JSON-blob-in-a-TEXT pattern as BillPaymentRevision's
    // previousValues/newValues.
    breakdownJson: { type: DataTypes.TEXT, allowNull: false },
  }, {
    tableName: 'payslips',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['payrollRunId'] },
      { fields: ['staffId'] },
    ],
  });

  Payslip.associate = (models) => {
    Payslip.belongsTo(models.School, { foreignKey: 'schoolId' });
    Payslip.belongsTo(models.PayrollRun, { foreignKey: 'payrollRunId' });
    Payslip.belongsTo(models.Staff, { foreignKey: 'staffId' });
  };

  return Payslip;
};
