module.exports = (sequelize, DataTypes) => {
  const DepreciationEntry = sequelize.define('DepreciationEntry', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    fixedAssetId: { type: DataTypes.UUID, allowNull: false },
    periodLabel: { type: DataTypes.STRING(20), allowNull: false }, // e.g. "2026-07"
    periodStart: { type: DataTypes.DATEONLY, allowNull: false },
    periodEnd: { type: DataTypes.DATEONLY, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    runByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'depreciation_entries',
    indexes: [
      { fields: ['schoolId'] },
      // Prevents double-depreciating the same asset in the same period.
      { unique: true, fields: ['fixedAssetId', 'periodLabel'] },
    ],
  });

  DepreciationEntry.associate = (models) => {
    DepreciationEntry.belongsTo(models.School, { foreignKey: 'schoolId' });
    DepreciationEntry.belongsTo(models.FixedAsset, { foreignKey: 'fixedAssetId' });
    DepreciationEntry.belongsTo(models.User, { foreignKey: 'runByUserId', as: 'runBy' });
  };

  return DepreciationEntry;
};
