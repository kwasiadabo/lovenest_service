module.exports = (sequelize, DataTypes) => {
  const FeeAmount = sequelize.define('FeeAmount', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    academicYearId: { type: DataTypes.UUID, allowNull: true },
    termId: { type: DataTypes.UUID, allowNull: true }, // null for ADMISSION-category fees; required otherwise
    levelId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: true }, // optional per-class override; null = level default
    feeTypeId: { type: DataTypes.UUID, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    tableName: 'fee_amounts',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['academicYearId'] },
      { fields: ['termId'] },
      { fields: ['levelId'] },
      { fields: ['classId'] },
      { fields: ['feeTypeId'] },
    ],
  });

  FeeAmount.associate = (models) => {
    FeeAmount.belongsTo(models.School, { foreignKey: 'schoolId' });
    FeeAmount.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    FeeAmount.belongsTo(models.Term, { foreignKey: 'termId' });
    FeeAmount.belongsTo(models.Level, { foreignKey: 'levelId' });
    FeeAmount.belongsTo(models.Class, { foreignKey: 'classId' });
    FeeAmount.belongsTo(models.FeeType, { foreignKey: 'feeTypeId' });
  };

  return FeeAmount;
};
