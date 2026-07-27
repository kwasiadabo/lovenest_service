const OUTCOMES = ['PROMOTED', 'GRADUATED', 'SKIPPED'];

module.exports = (sequelize, DataTypes) => {
  const PromotionBatchItem = sequelize.define('PromotionBatchItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    promotionBatchId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    fromClassId: { type: DataTypes.UUID, allowNull: false },
    // Null for GRADUATED/SKIPPED — there's no target class for either.
    toClassId: { type: DataTypes.UUID, allowNull: true },
    outcome: { type: DataTypes.ENUM(...OUTCOMES), allowNull: false },
    skipReason: { type: DataTypes.STRING(200), allowNull: true },
  }, {
    tableName: 'promotion_batch_items',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['promotionBatchId'] },
      { fields: ['studentId'] },
    ],
  });

  PromotionBatchItem.OUTCOMES = OUTCOMES;

  PromotionBatchItem.associate = (models) => {
    PromotionBatchItem.belongsTo(models.School, { foreignKey: 'schoolId' });
    PromotionBatchItem.belongsTo(models.PromotionBatch, { foreignKey: 'promotionBatchId' });
    PromotionBatchItem.belongsTo(models.Student, { foreignKey: 'studentId' });
    PromotionBatchItem.belongsTo(models.Class, { foreignKey: 'fromClassId', as: 'fromClass' });
    PromotionBatchItem.belongsTo(models.Class, { foreignKey: 'toClassId', as: 'toClass' });
  };

  return PromotionBatchItem;
};
