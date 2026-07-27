module.exports = (sequelize, DataTypes) => {
  const StudentParent = sequelize.define('StudentParent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    parentId: { type: DataTypes.UUID, allowNull: false },
    relationship: { type: DataTypes.ENUM('FATHER', 'MOTHER'), allowNull: false },
  }, {
    tableName: 'student_parents',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'parentId'] },
      // A student has at most one FATHER link and one MOTHER link.
      { unique: true, fields: ['studentId', 'relationship'] },
    ],
  });

  StudentParent.associate = (models) => {
    StudentParent.belongsTo(models.School, { foreignKey: 'schoolId' });
    StudentParent.belongsTo(models.Student, { foreignKey: 'studentId' });
    StudentParent.belongsTo(models.Parent, { foreignKey: 'parentId' });
  };

  return StudentParent;
};
