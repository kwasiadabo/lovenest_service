module.exports = (sequelize, DataTypes) => {
  const ReportCard = sequelize.define('ReportCard', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    termId: { type: DataTypes.UUID, allowNull: false },
    academicYearId: { type: DataTypes.UUID, allowNull: false },
    conduct: { type: DataTypes.STRING(100), allowNull: true },
    interest: { type: DataTypes.STRING(200), allowNull: true },
    classTeacherRemark: { type: DataTypes.STRING(1000), allowNull: true },
    headteacherRemark: { type: DataTypes.STRING(1000), allowNull: true },
    // JSON-serialized against a fixed key set (see reportCards/
    // behaviorFields.js) — TEXT rather than DataTypes.JSON, matching this
    // app's existing convention for serialized blobs (see
    // ImportBatch.rowsJson, BillPaymentRevision.previousValues/newValues).
    // behaviorProgress: { [key]: 0-100 }. The three comment blocks:
    // { [key]: string }.
    behaviorProgress: { type: DataTypes.TEXT, allowNull: true },
    generalComments: { type: DataTypes.TEXT, allowNull: true },
    learningBehaviourComments: { type: DataTypes.TEXT, allowNull: true },
    growthMindsetComments: { type: DataTypes.TEXT, allowNull: true },
    promotionStatus: {
      type: DataTypes.ENUM('PROMOTED', 'REPEATED', 'NOT_APPLICABLE'),
      allowNull: false,
      defaultValue: 'NOT_APPLICABLE',
    },
    promotedToClassId: { type: DataTypes.UUID, allowNull: true },
    nextTermStartDate: { type: DataTypes.DATEONLY, allowNull: true },
    status: {
      type: DataTypes.ENUM('DRAFT', 'PUBLISHED'), allowNull: false, defaultValue: 'DRAFT',
    },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    publishedByStaffId: { type: DataTypes.UUID, allowNull: true },
    createdByStaffId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'report_cards',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['studentId', 'termId'], name: 'report_cards_unique_student_term' },
      { fields: ['schoolId', 'classId', 'termId'], name: 'report_cards_class_term' },
    ],
  });

  ReportCard.associate = (models) => {
    ReportCard.belongsTo(models.School, { foreignKey: 'schoolId' });
    ReportCard.belongsTo(models.Student, { foreignKey: 'studentId' });
    ReportCard.belongsTo(models.Class, { foreignKey: 'classId' });
    ReportCard.belongsTo(models.Term, { foreignKey: 'termId' });
    ReportCard.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    ReportCard.belongsTo(models.Class, { foreignKey: 'promotedToClassId', as: 'promotedToClass' });
    ReportCard.belongsTo(models.Staff, { foreignKey: 'publishedByStaffId', as: 'publishedBy' });
    ReportCard.belongsTo(models.Staff, { foreignKey: 'createdByStaffId', as: 'createdBy' });
  };

  return ReportCard;
};
