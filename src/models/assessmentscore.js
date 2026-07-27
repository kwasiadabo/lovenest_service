module.exports = (sequelize, DataTypes) => {
  const AssessmentScore = sequelize.define('AssessmentScore', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    assessmentItemId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    rawScore: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
  }, {
    tableName: 'assessment_scores',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['assessmentItemId', 'studentId'] },
    ],
  });

  AssessmentScore.associate = (models) => {
    AssessmentScore.belongsTo(models.School, { foreignKey: 'schoolId' });
    AssessmentScore.belongsTo(models.AssessmentItem, { foreignKey: 'assessmentItemId' });
    AssessmentScore.belongsTo(models.Student, { foreignKey: 'studentId' });
  };

  return AssessmentScore;
};
