module.exports = (sequelize, DataTypes) => {
  const RankingResult = sequelize.define('RankingResult', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    resultCalculationId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    subjectId: { type: DataTypes.UUID, allowNull: true },
    termId: { type: DataTypes.UUID, allowNull: false },
    scope: { type: DataTypes.ENUM('CLASS', 'STREAM', 'YEAR_GROUP', 'SUBJECT', 'SCHOOL'), allowNull: false },
    scopeRefId: { type: DataTypes.UUID, allowNull: true },
    rankingMethod: { type: DataTypes.ENUM('COMPETITION', 'DENSE', 'AVERAGE'), allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false },
    positionDecimal: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    tieGroupSize: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    populationSize: { type: DataTypes.INTEGER, allowNull: false },
    rawScore: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
  }, {
    tableName: 'ranking_results',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['resultCalculationId'] },
      {
        fields: ['schoolId', 'studentId', 'subjectId', 'termId', 'scope'], name: 'ranking_results_lookup',
      },
    ],
  });

  RankingResult.associate = (models) => {
    RankingResult.belongsTo(models.School, { foreignKey: 'schoolId' });
    RankingResult.belongsTo(models.ResultCalculation, { foreignKey: 'resultCalculationId' });
    RankingResult.belongsTo(models.Student, { foreignKey: 'studentId' });
    RankingResult.belongsTo(models.Subject, { foreignKey: 'subjectId' });
    RankingResult.belongsTo(models.Term, { foreignKey: 'termId' });
  };

  return RankingResult;
};
