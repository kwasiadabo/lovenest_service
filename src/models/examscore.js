module.exports = (sequelize, DataTypes) => {
  const ExamScore = sequelize.define('ExamScore', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    subjectId: { type: DataTypes.UUID, allowNull: false },
    termId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    caPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    caScaled: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    examRaw: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    examScaled: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    totalScore: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    // A-E effort grade (see reportCards/behaviorFields.js's EFFORT_SCHEME),
    // teacher-entered alongside CA/exam marks — separate from the
    // score-derived academic grade, since effort is a subjective judgment,
    // not something resolveGrade() can compute from a number.
    effort: { type: DataTypes.STRING(2), allowNull: true },
    recordedByStaffId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.ENUM('DRAFT', 'CONFIRMED'), allowNull: false, defaultValue: 'DRAFT' },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    confirmedByStaffId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'exam_scores',
    indexes: [
      { fields: ['schoolId'] },
      {
        unique: true, fields: ['schoolId', 'classId', 'subjectId', 'termId', 'studentId'], name: 'exam_scores_unique_scope',
      },
    ],
  });

  ExamScore.associate = (models) => {
    ExamScore.belongsTo(models.School, { foreignKey: 'schoolId' });
    ExamScore.belongsTo(models.Class, { foreignKey: 'classId' });
    ExamScore.belongsTo(models.Subject, { foreignKey: 'subjectId' });
    ExamScore.belongsTo(models.Term, { foreignKey: 'termId' });
    ExamScore.belongsTo(models.Student, { foreignKey: 'studentId' });
    ExamScore.belongsTo(models.Staff, { foreignKey: 'recordedByStaffId', as: 'recordedBy' });
    ExamScore.belongsTo(models.Staff, { foreignKey: 'confirmedByStaffId', as: 'confirmedBy' });
  };

  return ExamScore;
};
