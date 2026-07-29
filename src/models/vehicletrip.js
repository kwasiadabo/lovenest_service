const STATUSES = ['ACTIVE', 'ENDED'];
// PICKUP: driver is heading out to collect students (school -> stops).
// DROPOFF: driver is heading out to take students home (school -> stops,
// same direction of travel as PICKUP but the opposite purpose) — this only
// changes alert wording/labeling (see transport/notify.js#notifyTripStarted),
// not the location-broadcast mechanism itself.
const TRIP_TYPES = ['PICKUP', 'DROPOFF'];

module.exports = (sequelize, DataTypes) => {
  const VehicleTrip = sequelize.define('VehicleTrip', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    vehicleId: { type: DataTypes.UUID, allowNull: false },
    driverStaffId: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVE' },
    tripType: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PICKUP' },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    // Latest known position only — this is a live-location feature, not a
    // route-history/breadcrumb one, so each ping overwrites the last rather
    // than appending a new row (see transport/service.js#updateTripLocation).
    lastLatitude: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    lastLongitude: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    lastPingAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'vehicle_trips',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['vehicleId'] },
    ],
  });

  VehicleTrip.STATUSES = STATUSES;
  VehicleTrip.TRIP_TYPES = TRIP_TYPES;

  VehicleTrip.associate = (models) => {
    VehicleTrip.belongsTo(models.School, { foreignKey: 'schoolId' });
    VehicleTrip.belongsTo(models.Vehicle, { foreignKey: 'vehicleId' });
    VehicleTrip.belongsTo(models.Staff, { foreignKey: 'driverStaffId', as: 'driver' });
  };

  return VehicleTrip;
};
