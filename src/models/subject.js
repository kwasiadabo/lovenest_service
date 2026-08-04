module.exports = (sequelize, DataTypes) => {
  const Subject = sequelize.define('Subject', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(20), allowNull: false },
    // Used to color-code the subject wherever it's shown at a glance (the
    // timetable grid especially) — free-form hex rather than a fixed
    // palette, so a school can keep its own subjects visually distinct.
    color: { type: DataTypes.STRING(7), allowNull: false, defaultValue: '#2a78d6' },
  }, {
    tableName: 'subjects',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'name'] },
      { unique: true, fields: ['schoolId', 'code'] },
    ],
  });

  Subject.associate = (models) => {
    Subject.belongsTo(models.School, { foreignKey: 'schoolId' });
  };

  return Subject;
};
