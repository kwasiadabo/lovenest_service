module.exports = (sequelize, DataTypes) => {
  const PerformanceLevel = sequelize.define('PerformanceLevel', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    gradingSchemeId: { type: DataTypes.UUID, allowNull: false },
    minScore: { type: DataTypes.INTEGER, allowNull: false },
    maxScore: { type: DataTypes.INTEGER, allowNull: false },
    label: { type: DataTypes.STRING(50), allowNull: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    tableName: 'performance_levels',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['gradingSchemeId'] },
    ],
  });

  PerformanceLevel.associate = (models) => {
    PerformanceLevel.belongsTo(models.School, { foreignKey: 'schoolId' });
    PerformanceLevel.belongsTo(models.GradingScheme, { foreignKey: 'gradingSchemeId' });
  };

  return PerformanceLevel;
};
