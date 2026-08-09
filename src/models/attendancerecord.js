module.exports = (sequelize, DataTypes) => {
  const AttendanceRecord = sequelize.define('AttendanceRecord', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    termId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('PRESENT', 'ABSENT', 'LATE'), allowNull: false },
    markedByStaffId: { type: DataTypes.UUID, allowNull: true },
    notes: { type: DataTypes.STRING(200), allowNull: true },
  }, {
    tableName: 'attendance_records',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['studentId', 'date'], name: 'attendance_records_unique_student_date' },
      { fields: ['schoolId', 'classId', 'date'], name: 'attendance_records_class_date' },
      { fields: ['schoolId', 'studentId', 'termId'], name: 'attendance_records_student_term' },
    ],
  });

  AttendanceRecord.associate = (models) => {
    AttendanceRecord.belongsTo(models.School, { foreignKey: 'schoolId' });
    AttendanceRecord.belongsTo(models.Student, { foreignKey: 'studentId' });
    AttendanceRecord.belongsTo(models.Class, { foreignKey: 'classId' });
    AttendanceRecord.belongsTo(models.Term, { foreignKey: 'termId' });
    AttendanceRecord.belongsTo(models.Staff, { foreignKey: 'markedByStaffId', as: 'markedBy' });
  };

  return AttendanceRecord;
};
