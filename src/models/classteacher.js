module.exports = (sequelize, DataTypes) => {
  const ClassTeacher = sequelize.define('ClassTeacher', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
  }, {
    tableName: 'class_teachers',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['classId', 'staffId'] },
    ],
  });

  ClassTeacher.associate = (models) => {
    ClassTeacher.belongsTo(models.School, { foreignKey: 'schoolId' });
    ClassTeacher.belongsTo(models.Class, { foreignKey: 'classId' });
    ClassTeacher.belongsTo(models.Staff, { foreignKey: 'staffId' });
  };

  return ClassTeacher;
};
