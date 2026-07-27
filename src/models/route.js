module.exports = (sequelize, DataTypes) => {
  const Route = sequelize.define('Route', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    vehicleId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false }, // e.g. "Route 1 - East Legon / Spintex"
    notes: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'transport_routes',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['vehicleId'] },
      { unique: true, fields: ['schoolId', 'name'] },
    ],
  });

  Route.associate = (models) => {
    Route.belongsTo(models.School, { foreignKey: 'schoolId' });
    Route.belongsTo(models.Vehicle, { foreignKey: 'vehicleId' });
    Route.hasMany(models.PickupPoint, { foreignKey: 'routeId' });
  };

  return Route;
};
