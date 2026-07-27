module.exports = (sequelize, DataTypes) => {
  const StudentClassAssignment = sequelize.define('StudentClassAssignment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    academicYearId: { type: DataTypes.UUID, allowNull: false },
  }, {
    tableName: 'student_class_assignments',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'classId', 'academicYearId'] },
      // One class per student per academic year — re-assigning within the
      // same year updates this row instead of creating a second one.
      { unique: true, fields: ['studentId', 'academicYearId'] },
    ],
  });

  StudentClassAssignment.associate = (models) => {
    StudentClassAssignment.belongsTo(models.School, { foreignKey: 'schoolId' });
    StudentClassAssignment.belongsTo(models.Student, { foreignKey: 'studentId' });
    StudentClassAssignment.belongsTo(models.Class, { foreignKey: 'classId' });
    StudentClassAssignment.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
  };

  return StudentClassAssignment;
};
