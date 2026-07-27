module.exports = (sequelize, DataTypes) => {
  const AcademicYear = sequelize.define('AcademicYear', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(20), allowNull: false }, // e.g. "2025/2026"
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    tableName: 'academic_years',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'name'] },
    ],
  });

  AcademicYear.associate = (models) => {
    AcademicYear.belongsTo(models.School, { foreignKey: 'schoolId' });
    AcademicYear.hasMany(models.Term, { foreignKey: 'academicYearId' });
  };

  return AcademicYear;
};
