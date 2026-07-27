module.exports = (sequelize, DataTypes) => {
  const TimetablePeriod = sequelize.define('TimetablePeriod', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(50), allowNull: false }, // e.g. "Period 1", "Break", "Lunch"
    startTime: { type: DataTypes.STRING(5), allowNull: false }, // "HH:MM", 24h
    endTime: { type: DataTypes.STRING(5), allowNull: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isBreak: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    tableName: 'timetable_periods',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'name'] },
    ],
  });

  TimetablePeriod.associate = (models) => {
    TimetablePeriod.belongsTo(models.School, { foreignKey: 'schoolId' });
    TimetablePeriod.hasMany(models.TimetableSlot, { foreignKey: 'periodId' });
  };

  return TimetablePeriod;
};
