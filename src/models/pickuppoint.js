module.exports = (sequelize, DataTypes) => {
  const PickupPoint = sequelize.define('PickupPoint', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    routeId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false }, // e.g. "Spintex Junction"
    scheduledTime: { type: DataTypes.STRING(5), allowNull: false }, // "HH:MM", 24h
    sequenceOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'transport_pickup_points',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['routeId'] },
      { unique: true, fields: ['routeId', 'name'] },
    ],
  });

  PickupPoint.associate = (models) => {
    PickupPoint.belongsTo(models.School, { foreignKey: 'schoolId' });
    PickupPoint.belongsTo(models.Route, { foreignKey: 'routeId' });
    PickupPoint.hasMany(models.StudentTransport, { foreignKey: 'pickupPointId' });
  };

  return PickupPoint;
};
