module.exports = (sequelize, DataTypes) => {
  const PromotionBatch = sequelize.define('PromotionBatch', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    fromAcademicYearId: { type: DataTypes.UUID, allowNull: false },
    toAcademicYearId: { type: DataTypes.UUID, allowNull: false },
    runByUserId: { type: DataTypes.UUID, allowNull: true },
    promotedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    graduatedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skippedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'promotion_batches',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['fromAcademicYearId'] },
      { fields: ['toAcademicYearId'] },
    ],
  });

  PromotionBatch.associate = (models) => {
    PromotionBatch.belongsTo(models.School, { foreignKey: 'schoolId' });
    PromotionBatch.belongsTo(models.AcademicYear, { foreignKey: 'fromAcademicYearId', as: 'fromAcademicYear' });
    PromotionBatch.belongsTo(models.AcademicYear, { foreignKey: 'toAcademicYearId', as: 'toAcademicYear' });
    PromotionBatch.belongsTo(models.User, { foreignKey: 'runByUserId', as: 'runBy' });
    PromotionBatch.hasMany(models.PromotionBatchItem, { foreignKey: 'promotionBatchId', as: 'items' });
  };

  return PromotionBatch;
};
