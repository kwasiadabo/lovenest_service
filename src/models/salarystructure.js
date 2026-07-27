module.exports = (sequelize, DataTypes) => {
  const SalaryStructure = sequelize.define('SalaryStructure', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false },
    basicSalaryPesewas: { type: DataTypes.INTEGER, allowNull: false },
    // Only one active structure per staff at a time — setting a new one
    // active deactivates the previous (see payroll/service.js
    // #setSalaryStructure), mirroring how syncStudentDiscount treats "at
    // most one active" for student discounts.
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'salary_structures',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['staffId'] },
    ],
  });

  SalaryStructure.associate = (models) => {
    SalaryStructure.belongsTo(models.School, { foreignKey: 'schoolId' });
    SalaryStructure.belongsTo(models.Staff, { foreignKey: 'staffId' });
    SalaryStructure.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    SalaryStructure.hasMany(models.SalaryComponent, { foreignKey: 'salaryStructureId', as: 'components' });
  };

  return SalaryStructure;
};
