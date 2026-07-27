const STATUSES = ['PICKED_UP', 'MISSED'];

module.exports = (sequelize, DataTypes) => {
  const PickupRecord = sequelize.define('PickupRecord', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    vehicleId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'transport_pickup_records',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['vehicleId', 'date'] },
      { unique: true, fields: ['studentId', 'date'] },
    ],
  });

  PickupRecord.STATUSES = STATUSES;

  PickupRecord.associate = (models) => {
    PickupRecord.belongsTo(models.School, { foreignKey: 'schoolId' });
    PickupRecord.belongsTo(models.Student, { foreignKey: 'studentId' });
    PickupRecord.belongsTo(models.Vehicle, { foreignKey: 'vehicleId' });
    PickupRecord.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
  };

  return PickupRecord;
};
