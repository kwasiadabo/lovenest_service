module.exports = (sequelize, DataTypes) => {
  const DropoffRecord = sequelize.define('DropoffRecord', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    vehicleId: { type: DataTypes.UUID, allowNull: false },
    // DATEONLY (for per-day dedupe/reporting) alongside the precise
    // timestamp below — same split as attendance_records' date column.
    date: { type: DataTypes.DATEONLY, allowNull: false },
    // Server clock at the moment the drop-off was recorded, not a
    // client-supplied value — this is a live "it's happening now" event,
    // not a backdated entry, so trusting the recording device's clock isn't
    // necessary or desirable.
    droppedOffAt: { type: DataTypes.DATE, allowNull: false },
    // Captured via the recording device's browser geolocation — nullable
    // since a staff member may deny/lack location permission and the
    // drop-off should still be recordable without it.
    latitude: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'transport_dropoff_records',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['vehicleId', 'date'] },
      // One drop-off per student per day — same reasoning as
      // transport_pickup_records' unique(studentId, date).
      { unique: true, fields: ['studentId', 'date'] },
    ],
  });

  DropoffRecord.associate = (models) => {
    DropoffRecord.belongsTo(models.School, { foreignKey: 'schoolId' });
    DropoffRecord.belongsTo(models.Student, { foreignKey: 'studentId' });
    DropoffRecord.belongsTo(models.Vehicle, { foreignKey: 'vehicleId' });
    DropoffRecord.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
  };

  return DropoffRecord;
};
