module.exports = (sequelize, DataTypes) => {
  const Level = sequelize.define('Level', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(50), allowNull: false }, // e.g. "Primary 4"
    category: {
      type: DataTypes.ENUM('NURSERY', 'KG', 'PRIMARY', 'JHS'),
      allowNull: false,
    },
    sequenceOrder: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    tableName: 'levels',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'name'] },
    ],
  });

  Level.associate = (models) => {
    Level.belongsTo(models.School, { foreignKey: 'schoolId' });
    Level.hasMany(models.Class, { foreignKey: 'levelId' });
    Level.hasMany(models.FeeAmount, { foreignKey: 'levelId' });
  };

  return Level;
};
