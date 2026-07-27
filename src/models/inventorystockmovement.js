const TYPES = ['RESTOCK', 'ISSUE'];

module.exports = (sequelize, DataTypes) => {
  const InventoryStockMovement = sequelize.define('InventoryStockMovement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    inventoryItemId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM(...TYPES), allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    // Stock level immediately after this movement — lets the history read as
    // a running balance without replaying every prior movement.
    balanceAfter: { type: DataTypes.INTEGER, allowNull: false },
    inventoryRequestId: { type: DataTypes.UUID, allowNull: true },
    performedByUserId: { type: DataTypes.UUID, allowNull: false },
    note: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'inventory_stock_movements',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['inventoryItemId', 'createdAt'] },
    ],
  });

  InventoryStockMovement.TYPES = TYPES;

  InventoryStockMovement.associate = (models) => {
    InventoryStockMovement.belongsTo(models.School, { foreignKey: 'schoolId' });
    InventoryStockMovement.belongsTo(models.InventoryItem, { foreignKey: 'inventoryItemId' });
    InventoryStockMovement.belongsTo(models.InventoryRequest, { foreignKey: 'inventoryRequestId' });
    InventoryStockMovement.belongsTo(models.User, { foreignKey: 'performedByUserId', as: 'performedBy' });
  };

  return InventoryStockMovement;
};
