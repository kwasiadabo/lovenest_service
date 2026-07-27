module.exports = (sequelize, DataTypes) => {
  const AssessmentItem = sequelize.define('AssessmentItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    subjectId: { type: DataTypes.UUID, allowNull: false },
    termId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM('CLASSWORK', 'PROJECT'), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    maxScore: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    createdByStaffId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'assessment_items',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'classId', 'subjectId', 'termId', 'type'] },
    ],
  });

  AssessmentItem.associate = (models) => {
    AssessmentItem.belongsTo(models.School, { foreignKey: 'schoolId' });
    AssessmentItem.belongsTo(models.Class, { foreignKey: 'classId' });
    AssessmentItem.belongsTo(models.Subject, { foreignKey: 'subjectId' });
    AssessmentItem.belongsTo(models.Term, { foreignKey: 'termId' });
    AssessmentItem.belongsTo(models.Staff, { foreignKey: 'createdByStaffId', as: 'createdBy' });
    AssessmentItem.hasMany(models.AssessmentScore, { foreignKey: 'assessmentItemId', as: 'scores' });
  };

  return AssessmentItem;
};
