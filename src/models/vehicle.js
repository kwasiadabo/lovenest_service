const STATUSES = ['ACTIVE', 'INACTIVE'];

module.exports = (sequelize, DataTypes) => {
  const Vehicle = sequelize.define('Vehicle', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false }, // e.g. "Bus 1", "School Van A"
    registrationNumber: { type: DataTypes.STRING(30), allowNull: false },
    capacity: { type: DataTypes.INTEGER, allowNull: false },
    driverStaffId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
    // Rate charged to a student subscribed to this vehicle, one per billing
    // cycle a subscriber might pick — null means that cycle isn't priced yet
    // (transport/service.js#generateTransportInvoices skips and reports it
    // rather than silently billing 0), same "missing means unresolved, not
    // free" convention as FeeAmount.
    termlyFeePesewas: { type: DataTypes.INTEGER, allowNull: true },
    monthlyFeePesewas: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'vehicles',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'name'] },
      { unique: true, fields: ['schoolId', 'registrationNumber'] },
    ],
  });

  Vehicle.STATUSES = STATUSES;

  Vehicle.associate = (models) => {
    Vehicle.belongsTo(models.School, { foreignKey: 'schoolId' });
    Vehicle.belongsTo(models.Staff, { foreignKey: 'driverStaffId', as: 'driver' });
    Vehicle.hasMany(models.StudentTransport, { foreignKey: 'vehicleId' });
    Vehicle.hasMany(models.VehicleTrip, { foreignKey: 'vehicleId' });
  };

  return Vehicle;
};
