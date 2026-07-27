const OUTCOMES = ['RETURNED_TO_CLASS', 'SENT_HOME', 'REFERRED_TO_HOSPITAL', 'PARENT_CALLED', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const SickBayVisit = sequelize.define('SickBayVisit', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    visitedAt: { type: DataTypes.DATE, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    treatmentGiven: { type: DataTypes.STRING(500), allowNull: true },
    outcome: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'RETURNED_TO_CLASS' },
    notes: { type: DataTypes.STRING(1000), allowNull: true },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'sick_bay_visits',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'studentId'] },
    ],
  });

  SickBayVisit.OUTCOMES = OUTCOMES;

  SickBayVisit.associate = (models) => {
    SickBayVisit.belongsTo(models.School, { foreignKey: 'schoolId' });
    SickBayVisit.belongsTo(models.Student, { foreignKey: 'studentId' });
    SickBayVisit.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
  };

  return SickBayVisit;
};
