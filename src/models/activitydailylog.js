module.exports = (sequelize, DataTypes) => {
  const ActivityDailyLog = sequelize.define('ActivityDailyLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    activityId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    termId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    rating: {
      type: DataTypes.ENUM('STRUGGLED', 'NEEDS_SUPPORT', 'OKAY', 'GOOD', 'EXCELLENT'),
      allowNull: false,
    },
    note: { type: DataTypes.STRING(500), allowNull: true },
    recordedByStaffId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'activity_daily_logs',
    indexes: [
      { fields: ['schoolId'] },
      {
        unique: true, fields: ['activityId', 'classId', 'studentId', 'date'], name: 'activity_daily_logs_unique_scope',
      },
    ],
  });

  ActivityDailyLog.associate = (models) => {
    ActivityDailyLog.belongsTo(models.School, { foreignKey: 'schoolId' });
    ActivityDailyLog.belongsTo(models.Activity, { foreignKey: 'activityId' });
    ActivityDailyLog.belongsTo(models.Class, { foreignKey: 'classId' });
    ActivityDailyLog.belongsTo(models.Term, { foreignKey: 'termId' });
    ActivityDailyLog.belongsTo(models.Student, { foreignKey: 'studentId' });
    ActivityDailyLog.belongsTo(models.Staff, { foreignKey: 'recordedByStaffId', as: 'recordedBy' });
  };

  return ActivityDailyLog;
};
