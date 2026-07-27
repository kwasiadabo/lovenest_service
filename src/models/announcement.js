module.exports = (sequelize, DataTypes) => {
  const Announcement = sequelize.define('Announcement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'announcements',
    indexes: [
      { fields: ['schoolId'] },
    ],
  });

  Announcement.associate = (models) => {
    Announcement.belongsTo(models.School, { foreignKey: 'schoolId' });
    Announcement.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
  };

  return Announcement;
};
