const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const FULFILMENT_STATUSES = ['UNFULFILLED', 'ISSUED'];

module.exports = (sequelize, DataTypes) => {
  const InventoryRequest = sequelize.define('InventoryRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    inventoryItemId: { type: DataTypes.UUID, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    purpose: { type: DataTypes.STRING(500), allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PENDING' },
    requestedByUserId: { type: DataTypes.UUID, allowNull: false },
    reviewedByUserId: { type: DataTypes.UUID, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    rejectionReason: { type: DataTypes.STRING(500), allowNull: true },
    // APPROVED only authorizes the request; stock doesn't leave the store
    // until a separate issue step flips this to ISSUED (mirrors
    // ExpenseRequest's status/paymentStatus split between approval and cash
    // actually moving).
    fulfilmentStatus: { type: DataTypes.ENUM(...FULFILMENT_STATUSES), allowNull: false, defaultValue: 'UNFULFILLED' },
    issuedAt: { type: DataTypes.DATE, allowNull: true },
    issuedByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'inventory_requests',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['inventoryItemId'] },
      { fields: ['status'] },
      { fields: ['requestedByUserId'] },
    ],
  });

  InventoryRequest.STATUSES = STATUSES;
  InventoryRequest.FULFILMENT_STATUSES = FULFILMENT_STATUSES;

  InventoryRequest.associate = (models) => {
    InventoryRequest.belongsTo(models.School, { foreignKey: 'schoolId' });
    InventoryRequest.belongsTo(models.InventoryItem, { foreignKey: 'inventoryItemId' });
    InventoryRequest.belongsTo(models.User, { foreignKey: 'requestedByUserId', as: 'requestedBy' });
    InventoryRequest.belongsTo(models.User, { foreignKey: 'reviewedByUserId', as: 'reviewedBy' });
    InventoryRequest.belongsTo(models.User, { foreignKey: 'issuedByUserId', as: 'issuedBy' });
  };

  return InventoryRequest;
};
