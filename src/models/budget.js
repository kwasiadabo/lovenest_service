const STATUSES = ['DRAFT', 'APPROVED'];

module.exports = (sequelize, DataTypes) => {
  const Budget = sequelize.define('Budget', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    academicYearId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'DRAFT' },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
    approvedByUserId: { type: DataTypes.UUID, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'budgets',
    indexes: [
      { fields: ['schoolId'] },
    ],
  });

  Budget.STATUSES = STATUSES;

  Budget.associate = (models) => {
    Budget.belongsTo(models.School, { foreignKey: 'schoolId' });
    Budget.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    Budget.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    Budget.belongsTo(models.User, { foreignKey: 'approvedByUserId', as: 'approvedBy' });
    Budget.hasMany(models.BudgetLine, { foreignKey: 'budgetId', as: 'lines' });
  };

  return Budget;
};
