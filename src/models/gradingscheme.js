module.exports = (sequelize, DataTypes) => {
  const GradingScheme = sequelize.define('GradingScheme', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    academicLevelId: { type: DataTypes.UUID, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.ENUM('DRAFT', 'ACTIVE', 'ARCHIVED'), allowNull: false, defaultValue: 'DRAFT' },
    supersedesSchemeId: { type: DataTypes.UUID, allowNull: true },
    effectiveAcademicYearId: { type: DataTypes.UUID, allowNull: true },
    rankingEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    rankingMethod: {
      type: DataTypes.ENUM('COMPETITION', 'DENSE', 'AVERAGE'), allowNull: false, defaultValue: 'COMPETITION',
    },
    percentileEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    stanineEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    stanineMinPopulation: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    stanineDefaultReferenceScope: {
      type: DataTypes.ENUM('CLASS', 'STREAM', 'YEAR_GROUP', 'SCHOOL', 'ACADEMIC_LEVEL', 'CUSTOM_COHORT'),
      allowNull: false,
      defaultValue: 'YEAR_GROUP',
    },
    showPositionOnReportCard: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    showPercentileOnReportCard: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    showStanineOnReportCard: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdByStaffId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'grading_schemes',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'academicLevelId', 'status'] },
    ],
  });

  GradingScheme.associate = (models) => {
    GradingScheme.belongsTo(models.School, { foreignKey: 'schoolId' });
    GradingScheme.belongsTo(models.Level, { foreignKey: 'academicLevelId', as: 'academicLevel' });
    GradingScheme.belongsTo(models.AcademicYear, { foreignKey: 'effectiveAcademicYearId' });
    GradingScheme.belongsTo(models.GradingScheme, { foreignKey: 'supersedesSchemeId', as: 'supersedesScheme' });
    GradingScheme.belongsTo(models.Staff, { foreignKey: 'createdByStaffId', as: 'createdBy' });
    GradingScheme.hasMany(models.PerformanceLevel, { foreignKey: 'gradingSchemeId', as: 'performanceLevels' });
    GradingScheme.hasMany(models.ResultCalculation, { foreignKey: 'gradingSchemeId' });
  };

  return GradingScheme;
};
