module.exports = (sequelize, DataTypes) => {
  const StaffDuty = sequelize.define('StaffDuty', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false }, // e.g. "Gate Duty"
    description: { type: DataTypes.STRING, allowNull: true },
  }, {
    tableName: 'staff_duties',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'name'] },
    ],
  });

  StaffDuty.associate = (models) => {
    StaffDuty.belongsTo(models.School, { foreignKey: 'schoolId' });
    StaffDuty.hasMany(models.DutyRoster, { foreignKey: 'dutyId' });
  };

  return StaffDuty;
};
