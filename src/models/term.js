module.exports = (sequelize, DataTypes) => {
  const Term = sequelize.define('Term', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    academicYearId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(20), allowNull: false }, // e.g. "Term 1"
    sequence: { type: DataTypes.INTEGER, allowNull: false }, // 1-3
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    tableName: 'terms',
    indexes: [
      { fields: ['schoolId', 'academicYearId'] },
      { unique: true, fields: ['academicYearId', 'sequence'] },
    ],
  });

  Term.associate = (models) => {
    Term.belongsTo(models.School, { foreignKey: 'schoolId' });
    Term.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
  };

  return Term;
};
