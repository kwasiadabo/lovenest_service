module.exports = (sequelize, DataTypes) => {
  const LevyStudent = sequelize.define('LevyStudent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    levyId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    // For a STUDENT-targeted levy, a row's mere existence puts that student
    // in scope; null here means "use the levy's default amountPesewas" —
    // non-null overrides it for this student only. Same convention as
    // LevyClassAmount.amountPesewas.
    amountPesewas: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'levy_students',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['levyId'] },
      { fields: ['studentId'] },
      { unique: true, fields: ['levyId', 'studentId'] },
    ],
  });

  LevyStudent.associate = (models) => {
    LevyStudent.belongsTo(models.School, { foreignKey: 'schoolId' });
    LevyStudent.belongsTo(models.Levy, { foreignKey: 'levyId' });
    LevyStudent.belongsTo(models.Student, { foreignKey: 'studentId' });
  };

  return LevyStudent;
};
