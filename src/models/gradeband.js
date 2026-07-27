module.exports = (sequelize, DataTypes) => {
  const GradeBand = sequelize.define('GradeBand', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    minScore: { type: DataTypes.INTEGER, allowNull: false },
    maxScore: { type: DataTypes.INTEGER, allowNull: false },
    grade: { type: DataTypes.STRING(5), allowNull: false },
    remark: { type: DataTypes.STRING(50), allowNull: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    tableName: 'grade_bands',
    indexes: [
      { fields: ['schoolId'] },
    ],
  });

  GradeBand.associate = (models) => {
    GradeBand.belongsTo(models.School, { foreignKey: 'schoolId' });
  };

  return GradeBand;
};
