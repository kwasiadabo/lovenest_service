module.exports = (sequelize, DataTypes) => {
  const Sermon = sequelize.define('Sermon', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    scripture: { type: DataTypes.STRING(150), allowNull: true },
    speaker: { type: DataTypes.STRING(150), allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    // The day this sermon is featured on the marketing site's daily popup —
    // see sermons/service.js#getTodaysPublic.
    date: { type: DataTypes.DATEONLY, allowNull: false },
    // JSON-serialized array of Cloudinary urls — TEXT rather than
    // DataTypes.JSON, same convention as Announcement.imagesJson.
    imagesJson: { type: DataTypes.TEXT, allowNull: true },
    ctaLabel: { type: DataTypes.STRING(60), allowNull: true },
    ctaUrl: { type: DataTypes.STRING(300), allowNull: true },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'sermons',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'date'] },
    ],
  });

  Sermon.associate = (models) => {
    Sermon.belongsTo(models.School, { foreignKey: 'schoolId' });
    Sermon.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
  };

  return Sermon;
};
