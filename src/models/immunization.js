const VACCINES = [
  'BCG',
  'OPV',
  'PENTA',
  'PCV',
  'ROTAVIRUS',
  'IPV',
  'MEASLES_RUBELLA',
  'YELLOW_FEVER',
  'MENINGITIS_A',
  'HEPATITIS_B',
  'TETANUS_DIPHTHERIA',
  'COVID_19',
  'OTHER',
];

module.exports = (sequelize, DataTypes) => {
  const Immunization = sequelize.define('Immunization', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    vaccine: { type: DataTypes.STRING(30), allowNull: false },
    // Only meaningful when vaccine === 'OTHER'.
    otherVaccineName: { type: DataTypes.STRING(100), allowNull: true },
    doseNumber: { type: DataTypes.STRING(30), allowNull: true },
    administeredDate: { type: DataTypes.DATEONLY, allowNull: false },
    nextDueDate: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.STRING(1000), allowNull: true },
    recordedByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'immunizations',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'studentId'] },
    ],
  });

  Immunization.VACCINES = VACCINES;

  Immunization.associate = (models) => {
    Immunization.belongsTo(models.School, { foreignKey: 'schoolId' });
    Immunization.belongsTo(models.Student, { foreignKey: 'studentId' });
    Immunization.belongsTo(models.User, { foreignKey: 'recordedByUserId', as: 'recordedBy' });
  };

  return Immunization;
};
