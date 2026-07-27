module.exports = (sequelize, DataTypes) => {
  const Newsletter = sequelize.define('Newsletter', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    publishedAt: { type: DataTypes.DATE, allowNull: false },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'newsletters',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['publishedAt'] },
    ],
  });

  Newsletter.associate = (models) => {
    Newsletter.belongsTo(models.School, { foreignKey: 'schoolId' });
    Newsletter.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
  };

  return Newsletter;
};
