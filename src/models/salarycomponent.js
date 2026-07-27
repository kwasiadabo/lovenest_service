const COMPONENT_TYPES = ['ALLOWANCE', 'OTHER_DEDUCTION'];
const CALC_METHODS = ['FIXED', 'PERCENT_OF_BASIC'];

module.exports = (sequelize, DataTypes) => {
  const SalaryComponent = sequelize.define('SalaryComponent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    salaryStructureId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false }, // e.g. "Transport Allowance"
    componentType: { type: DataTypes.ENUM(...COMPONENT_TYPES), allowNull: false },
    calcMethod: { type: DataTypes.ENUM(...CALC_METHODS), allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: true }, // used when calcMethod = FIXED
    percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true }, // used when calcMethod = PERCENT_OF_BASIC
    // Whether this component counts toward PAYE-assessable income.
    taxable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'salary_components',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['salaryStructureId'] },
    ],
  });

  SalaryComponent.COMPONENT_TYPES = COMPONENT_TYPES;
  SalaryComponent.CALC_METHODS = CALC_METHODS;

  SalaryComponent.associate = (models) => {
    SalaryComponent.belongsTo(models.School, { foreignKey: 'schoolId' });
    SalaryComponent.belongsTo(models.SalaryStructure, { foreignKey: 'salaryStructureId' });
  };

  return SalaryComponent;
};
