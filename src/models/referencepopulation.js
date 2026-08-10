module.exports = (sequelize, DataTypes) => {
  const ReferencePopulation = sequelize.define('ReferencePopulation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    resultCalculationId: { type: DataTypes.UUID, allowNull: false },
    scope: {
      type: DataTypes.ENUM('CLASS', 'STREAM', 'YEAR_GROUP', 'SCHOOL', 'ACADEMIC_LEVEL', 'CUSTOM_COHORT'),
      allowNull: false,
    },
    scopeRefId: { type: DataTypes.UUID, allowNull: true },
    subjectId: { type: DataTypes.UUID, allowNull: true },
    termId: { type: DataTypes.UUID, allowNull: false },
    populationSize: { type: DataTypes.INTEGER, allowNull: false },
    meanScore: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    stdDevScore: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
  }, {
    tableName: 'reference_populations',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['resultCalculationId'] },
    ],
  });

  ReferencePopulation.associate = (models) => {
    ReferencePopulation.belongsTo(models.School, { foreignKey: 'schoolId' });
    ReferencePopulation.belongsTo(models.ResultCalculation, { foreignKey: 'resultCalculationId' });
    ReferencePopulation.belongsTo(models.Subject, { foreignKey: 'subjectId' });
    ReferencePopulation.belongsTo(models.Term, { foreignKey: 'termId' });
    ReferencePopulation.hasMany(models.PercentileResult, { foreignKey: 'referencePopulationId' });
    ReferencePopulation.hasMany(models.StanineResult, { foreignKey: 'referencePopulationId' });
  };

  return ReferencePopulation;
};
