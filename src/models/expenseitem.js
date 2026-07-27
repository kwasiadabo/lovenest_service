const CATEGORIES = ['UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT', 'SALARIES', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const ExpenseItem = sequelize.define('ExpenseItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false }, // e.g. "Electricity Bill", "Stationery", "Vehicle Fuel"
    category: { type: DataTypes.ENUM(...CATEGORIES), allowNull: false, defaultValue: 'OTHER' },
  }, {
    tableName: 'expense_items',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'name'] },
    ],
  });

  ExpenseItem.CATEGORIES = CATEGORIES;

  ExpenseItem.associate = (models) => {
    ExpenseItem.belongsTo(models.School, { foreignKey: 'schoolId' });
    ExpenseItem.hasMany(models.ExpenseRequest, { foreignKey: 'expenseItemId' });
  };

  return ExpenseItem;
};
