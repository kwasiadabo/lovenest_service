module.exports = (sequelize, DataTypes) => {
  const BudgetLine = sequelize.define('BudgetLine', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    budgetId: { type: DataTypes.UUID, allowNull: false },
    accountId: { type: DataTypes.UUID, allowNull: false },
    // Null = whole-year line, not scoped to a single term.
    termId: { type: DataTypes.UUID, allowNull: true },
    budgetedAmountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'budget_lines',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['budgetId'] },
    ],
  });

  BudgetLine.associate = (models) => {
    BudgetLine.belongsTo(models.School, { foreignKey: 'schoolId' });
    BudgetLine.belongsTo(models.Budget, { foreignKey: 'budgetId' });
    BudgetLine.belongsTo(models.Account, { foreignKey: 'accountId', as: 'account' });
    BudgetLine.belongsTo(models.Term, { foreignKey: 'termId' });
  };

  return BudgetLine;
};
