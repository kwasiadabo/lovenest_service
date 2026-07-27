module.exports = (sequelize, DataTypes) => {
  const Class = sequelize.define('Class', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    levelId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(50), allowNull: false }, // e.g. "4A"
    // Promotion mapping — at most one of the two is ever set (enforced in
    // academic/service.js#updateClass): nextClassId says where this class's
    // students go at year-end; isGraduatingClass says they graduate instead.
    // Neither set means "not configured yet" — students/service.js#
    // getPromotionPreview surfaces that as a warning rather than guessing.
    nextClassId: { type: DataTypes.UUID, allowNull: true },
    isGraduatingClass: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    tableName: 'classes',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'levelId', 'name'] },
    ],
  });

  Class.associate = (models) => {
    Class.belongsTo(models.School, { foreignKey: 'schoolId' });
    Class.belongsTo(models.Level, { foreignKey: 'levelId' });
    Class.belongsTo(models.Class, { foreignKey: 'nextClassId', as: 'nextClass' });
    // A class can have more than one class teacher, via the class_teachers join table.
    Class.belongsToMany(models.Staff, {
      through: models.ClassTeacher,
      as: 'classTeachers',
      foreignKey: 'classId',
      otherKey: 'staffId',
    });
    Class.hasMany(models.SubjectTeacher, { foreignKey: 'classId' });
  };

  return Class;
};
