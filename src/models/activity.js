module.exports = (sequelize, DataTypes) => {
  const Activity = sequelize.define('Activity', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    levelId: { type: DataTypes.UUID, allowNull: false },
    domain: { type: DataTypes.STRING(100), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: true },
    sequenceOrder: { type: DataTypes.INTEGER, allowNull: false },
    createdByStaffId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'activities',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'levelId', 'domain', 'name'] },
    ],
  });

  Activity.associate = (models) => {
    Activity.belongsTo(models.School, { foreignKey: 'schoolId' });
    Activity.belongsTo(models.Level, { foreignKey: 'levelId' });
    Activity.belongsTo(models.Staff, { foreignKey: 'createdByStaffId', as: 'createdBy' });
    Activity.hasMany(models.ActivityRating, { foreignKey: 'activityId', as: 'ratings' });
  };

  return Activity;
};
