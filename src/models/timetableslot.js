const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

module.exports = (sequelize, DataTypes) => {
  const TimetableSlot = sequelize.define('TimetableSlot', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    periodId: { type: DataTypes.UUID, allowNull: false },
    dayOfWeek: { type: DataTypes.ENUM(...DAYS_OF_WEEK), allowNull: false },
    subjectId: { type: DataTypes.UUID, allowNull: false },
    // Denormalized from SubjectTeacher at save time (see
    // modules/timetable/service.js#saveClassTimetable) — resolved once
    // rather than joined through on every read, and it's what the
    // teacher-double-booking check queries directly.
    staffId: { type: DataTypes.UUID, allowNull: false },
  }, {
    tableName: 'timetable_slots',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['classId'] },
      { fields: ['schoolId', 'dayOfWeek', 'periodId', 'staffId'] },
      { unique: true, fields: ['classId', 'dayOfWeek', 'periodId'] },
    ],
  });

  TimetableSlot.DAYS_OF_WEEK = DAYS_OF_WEEK;

  TimetableSlot.associate = (models) => {
    TimetableSlot.belongsTo(models.School, { foreignKey: 'schoolId' });
    TimetableSlot.belongsTo(models.Class, { foreignKey: 'classId' });
    TimetableSlot.belongsTo(models.TimetablePeriod, { foreignKey: 'periodId' });
    TimetableSlot.belongsTo(models.Subject, { foreignKey: 'subjectId' });
    TimetableSlot.belongsTo(models.Staff, { foreignKey: 'staffId' });
  };

  return TimetableSlot;
};
