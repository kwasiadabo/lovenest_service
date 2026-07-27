module.exports = (sequelize, DataTypes) => {
  const DutyRoster = sequelize.define('DutyRoster', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    dutyId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
  }, {
    tableName: 'duty_rosters',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['date'] },
      { unique: true, fields: ['dutyId', 'staffId', 'date'] },
    ],
  });

  DutyRoster.associate = (models) => {
    DutyRoster.belongsTo(models.School, { foreignKey: 'schoolId' });
    DutyRoster.belongsTo(models.StaffDuty, { foreignKey: 'dutyId', as: 'duty' });
    DutyRoster.belongsTo(models.Staff, { foreignKey: 'staffId' });
  };

  return DutyRoster;
};
