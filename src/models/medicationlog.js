module.exports = (sequelize, DataTypes) => {
  const MedicationLog = sequelize.define('MedicationLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    administeredAt: { type: DataTypes.DATE, allowNull: false },
    medicationName: { type: DataTypes.STRING(150), allowNull: false },
    dosage: { type: DataTypes.STRING(100), allowNull: false },
    reason: { type: DataTypes.STRING(300), allowNull: true },
    notes: { type: DataTypes.STRING(1000), allowNull: true },
    administeredByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'medication_logs',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'studentId'] },
    ],
  });

  MedicationLog.associate = (models) => {
    MedicationLog.belongsTo(models.School, { foreignKey: 'schoolId' });
    MedicationLog.belongsTo(models.Student, { foreignKey: 'studentId' });
    MedicationLog.belongsTo(models.User, { foreignKey: 'administeredByUserId', as: 'administeredBy' });
  };

  return MedicationLog;
};
