module.exports = (sequelize, DataTypes) => {
  const ResultCalculation = sequelize.define('ResultCalculation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    gradingSchemeId: { type: DataTypes.UUID, allowNull: false },
    gradingSchemeVersion: { type: DataTypes.INTEGER, allowNull: false },
    academicYearId: { type: DataTypes.UUID, allowNull: false },
    termId: { type: DataTypes.UUID, allowNull: false },
    scopeType: {
      type: DataTypes.ENUM('SCHOOL', 'ACADEMIC_LEVEL', 'CLASS', 'SUBJECT', 'STUDENT'), allowNull: false,
    },
    scopeRefId: { type: DataTypes.UUID, allowNull: true },
    triggerType: { type: DataTypes.ENUM('MANUAL', 'RECALCULATION'), allowNull: false, defaultValue: 'MANUAL' },
    status: {
      type: DataTypes.ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'), allowNull: false, defaultValue: 'PENDING',
    },
    triggeredByStaffId: { type: DataTypes.UUID, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    studentsProcessed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    errorMessage: { type: DataTypes.STRING(500), allowNull: true },
    supersedesCalculationId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'result_calculations',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'termId', 'status'] },
    ],
  });

  ResultCalculation.associate = (models) => {
    ResultCalculation.belongsTo(models.School, { foreignKey: 'schoolId' });
    ResultCalculation.belongsTo(models.GradingScheme, { foreignKey: 'gradingSchemeId' });
    ResultCalculation.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    ResultCalculation.belongsTo(models.Term, { foreignKey: 'termId' });
    ResultCalculation.belongsTo(models.Staff, { foreignKey: 'triggeredByStaffId', as: 'triggeredBy' });
    ResultCalculation.belongsTo(models.ResultCalculation, { foreignKey: 'supersedesCalculationId', as: 'supersedesCalculation' });
    ResultCalculation.hasMany(models.ReferencePopulation, { foreignKey: 'resultCalculationId' });
    ResultCalculation.hasMany(models.RankingResult, { foreignKey: 'resultCalculationId' });
    ResultCalculation.hasMany(models.PercentileResult, { foreignKey: 'resultCalculationId' });
    ResultCalculation.hasMany(models.StanineResult, { foreignKey: 'resultCalculationId' });
  };

  return ResultCalculation;
};
