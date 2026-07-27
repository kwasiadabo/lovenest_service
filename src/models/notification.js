module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(50), allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    body: { type: DataTypes.STRING(500), allowNull: true },
    // Frontend path to navigate to when the notification is clicked — may be
    // an /admin/... or /parent/... path depending on the recipient's portal.
    linkUrl: { type: DataTypes.STRING(300), allowNull: true },
    isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    readAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'notifications',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'userId'] },
      { fields: ['userId', 'isRead'] },
    ],
  });

  Notification.associate = (models) => {
    Notification.belongsTo(models.School, { foreignKey: 'schoolId' });
    Notification.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return Notification;
};
