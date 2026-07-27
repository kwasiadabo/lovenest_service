module.exports = (sequelize, DataTypes) => {
  const LevyClassAmount = sequelize.define('LevyClassAmount', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    levyId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    // For a CLASS-targeted levy, a row's mere existence puts that class in
    // scope; null here means "use the levy's default amountPesewas" (for
    // either target type) — non-null overrides it for this class only.
    amountPesewas: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'levy_class_amounts',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['levyId'] },
      { fields: ['classId'] },
      { unique: true, fields: ['levyId', 'classId'] },
    ],
  });

  LevyClassAmount.associate = (models) => {
    LevyClassAmount.belongsTo(models.School, { foreignKey: 'schoolId' });
    LevyClassAmount.belongsTo(models.Levy, { foreignKey: 'levyId' });
    LevyClassAmount.belongsTo(models.Class, { foreignKey: 'classId' });
  };

  return LevyClassAmount;
};
