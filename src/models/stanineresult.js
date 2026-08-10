module.exports = (sequelize, DataTypes) => {
  const StanineResult = sequelize.define('StanineResult', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    resultCalculationId: { type: DataTypes.UUID, allowNull: false },
    referencePopulationId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    subjectId: { type: DataTypes.UUID, allowNull: true },
    termId: { type: DataTypes.UUID, allowNull: false },
    // 1-9; null (with isInsufficientPopulation true) when the reference
    // population is below the scheme's configured minimum.
    stanine: { type: DataTypes.INTEGER, allowNull: true },
    isInsufficientPopulation: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    minimumRequiredPopulation: { type: DataTypes.INTEGER, allowNull: false },
    rawScore: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
  }, {
    tableName: 'stanine_results',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['resultCalculationId'] },
      {
        fields: ['schoolId', 'studentId', 'subjectId', 'termId'], name: 'stanine_results_lookup',
      },
    ],
  });

  StanineResult.associate = (models) => {
    StanineResult.belongsTo(models.School, { foreignKey: 'schoolId' });
    StanineResult.belongsTo(models.ResultCalculation, { foreignKey: 'resultCalculationId' });
    StanineResult.belongsTo(models.ReferencePopulation, { foreignKey: 'referencePopulationId' });
    StanineResult.belongsTo(models.Student, { foreignKey: 'studentId' });
    StanineResult.belongsTo(models.Subject, { foreignKey: 'subjectId' });
    StanineResult.belongsTo(models.Term, { foreignKey: 'termId' });
  };

  return StanineResult;
};
