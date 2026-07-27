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
