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
    // JSON-serialized array of Cloudinary urls — TEXT rather than
    // DataTypes.JSON, matching this app's existing convention for
    // serialized blobs (see ImportBatch.rowsJson). Always read/written via
    // service.js's parse/stringify helpers, never directly.
    imagesJson: { type: DataTypes.TEXT, allowNull: true },
    ctaLabel: { type: DataTypes.STRING(60), allowNull: true },
    ctaUrl: { type: DataTypes.STRING(300), allowNull: true },
    // The window this announcement shows in the marketing site's popup —
    // see the migration that added these two columns for why null/null
    // means "not shown there".
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'announcements',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'startDate', 'endDate'] },
    ],
  });

  Announcement.associate = (models) => {
    Announcement.belongsTo(models.School, { foreignKey: 'schoolId' });
    Announcement.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
  };

  return Announcement;
};
