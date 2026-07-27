module.exports = (sequelize, DataTypes) => {
  const SubjectTeacher = sequelize.define('SubjectTeacher', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    subjectId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
  }, {
    tableName: 'subject_teachers',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['classId', 'subjectId'] },
    ],
  });

  SubjectTeacher.associate = (models) => {
    SubjectTeacher.belongsTo(models.School, { foreignKey: 'schoolId' });
    SubjectTeacher.belongsTo(models.Class, { foreignKey: 'classId' });
    SubjectTeacher.belongsTo(models.Subject, { foreignKey: 'subjectId' });
    SubjectTeacher.belongsTo(models.Staff, { foreignKey: 'staffId' });
  };

  return SubjectTeacher;
};
