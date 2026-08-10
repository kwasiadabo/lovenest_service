module.exports = (sequelize, DataTypes) => {
  const PercentileResult = sequelize.define('PercentileResult', {
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
    percentile: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    rawScore: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
  }, {
    tableName: 'percentile_results',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['resultCalculationId'] },
      {
        fields: ['schoolId', 'studentId', 'subjectId', 'termId'], name: 'percentile_results_lookup',
      },
    ],
  });

  PercentileResult.associate = (models) => {
    PercentileResult.belongsTo(models.School, { foreignKey: 'schoolId' });
    PercentileResult.belongsTo(models.ResultCalculation, { foreignKey: 'resultCalculationId' });
    PercentileResult.belongsTo(models.ReferencePopulation, { foreignKey: 'referencePopulationId' });
    PercentileResult.belongsTo(models.Student, { foreignKey: 'studentId' });
    PercentileResult.belongsTo(models.Subject, { foreignKey: 'subjectId' });
    PercentileResult.belongsTo(models.Term, { foreignKey: 'termId' });
  };

  return PercentileResult;
};
