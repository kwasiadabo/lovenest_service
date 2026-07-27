const CATEGORIES = ['UNIFORM', 'TEXTBOOK', 'STATIONERY', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const InventoryItem = sequelize.define('InventoryItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false }, // e.g. "Boys' Uniform (Size 12)", "Maths Textbook - Basic 4"
    category: { type: DataTypes.ENUM(...CATEGORIES), allowNull: false, defaultValue: 'OTHER' },
    unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pcs' },
    // Only moved by restockInventoryItem (in) and issueInventoryRequest (out)
    // — never edited directly, so every change has a traceable cause.
    currentStockQty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reorderLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'inventory_items',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'name'] },
    ],
  });

  InventoryItem.CATEGORIES = CATEGORIES;

  InventoryItem.associate = (models) => {
    InventoryItem.belongsTo(models.School, { foreignKey: 'schoolId' });
    InventoryItem.hasMany(models.InventoryRequest, { foreignKey: 'inventoryItemId' });
    InventoryItem.hasMany(models.InventoryStockMovement, { foreignKey: 'inventoryItemId' });
  };

  return InventoryItem;
};
