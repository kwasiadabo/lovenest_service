const CATEGORIES = [
  'LAND', 'BUILDING', 'FURNITURE_FIXTURES', 'OFFICE_EQUIPMENT', 'ICT_EQUIPMENT', 'MOTOR_VEHICLE', 'OTHER',
];
const DEPRECIATION_METHODS = ['STRAIGHT_LINE'];
const STATUSES = ['ACTIVE', 'DISPOSED'];

module.exports = (sequelize, DataTypes) => {
  const FixedAsset = sequelize.define('FixedAsset', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    // Sequential per school, e.g. "FA-000001" — same generation pattern as
    // BillPayment.receiptNumber.
    assetCode: { type: DataTypes.STRING(20), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    category: { type: DataTypes.ENUM(...CATEGORIES), allowNull: false },
    acquisitionDate: { type: DataTypes.DATEONLY, allowNull: false },
    costPesewas: { type: DataTypes.INTEGER, allowNull: false },
    residualValuePesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // Nullable only for LAND, which never depreciates.
    usefulLifeMonths: { type: DataTypes.INTEGER, allowNull: true },
    depreciationMethod: { type: DataTypes.ENUM(...DEPRECIATION_METHODS), allowNull: false, defaultValue: 'STRAIGHT_LINE' },
    assetAccountId: { type: DataTypes.UUID, allowNull: false },
    accumulatedDepreciationAccountId: { type: DataTypes.UUID, allowNull: true },
    depreciationExpenseAccountId: { type: DataTypes.UUID, allowNull: true },
    // Phase 1 requires cash purchase — financed/AP-based acquisition is an
    // explicit, documented limitation, not built now.
    cashAccountId: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
    disposalDate: { type: DataTypes.DATEONLY, allowNull: true },
    disposalProceedsPesewas: { type: DataTypes.INTEGER, allowNull: true },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'fixed_assets',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'assetCode'] },
    ],
  });

  FixedAsset.CATEGORIES = CATEGORIES;
  FixedAsset.STATUSES = STATUSES;

  FixedAsset.associate = (models) => {
    FixedAsset.belongsTo(models.School, { foreignKey: 'schoolId' });
    FixedAsset.belongsTo(models.Account, { foreignKey: 'assetAccountId', as: 'assetAccount' });
    FixedAsset.belongsTo(models.Account, { foreignKey: 'accumulatedDepreciationAccountId', as: 'accumulatedDepreciationAccount' });
    FixedAsset.belongsTo(models.Account, { foreignKey: 'depreciationExpenseAccountId', as: 'depreciationExpenseAccount' });
    FixedAsset.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    FixedAsset.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    FixedAsset.hasMany(models.DepreciationEntry, { foreignKey: 'fixedAssetId', as: 'depreciationEntries' });
  };

  return FixedAsset;
};
