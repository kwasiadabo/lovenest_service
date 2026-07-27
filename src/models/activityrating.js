module.exports = (sequelize, DataTypes) => {
  const ActivityRating = sequelize.define('ActivityRating', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    activityId: { type: DataTypes.UUID, allowNull: false },
    classId: { type: DataTypes.UUID, allowNull: false },
    termId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    rating: {
      type: DataTypes.ENUM('BEGINNING', 'DEVELOPING', 'PROFICIENT', 'EXCELLING'),
      allowNull: false,
    },
    recordedByStaffId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.ENUM('DRAFT', 'CONFIRMED'), allowNull: false, defaultValue: 'DRAFT' },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    confirmedByStaffId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'activity_ratings',
    indexes: [
      { fields: ['schoolId'] },
      {
        unique: true, fields: ['activityId', 'classId', 'termId', 'studentId'], name: 'activity_ratings_unique_scope',
      },
    ],
  });

  ActivityRating.associate = (models) => {
    ActivityRating.belongsTo(models.School, { foreignKey: 'schoolId' });
    ActivityRating.belongsTo(models.Activity, { foreignKey: 'activityId' });
    ActivityRating.belongsTo(models.Class, { foreignKey: 'classId' });
    ActivityRating.belongsTo(models.Term, { foreignKey: 'termId' });
    ActivityRating.belongsTo(models.Student, { foreignKey: 'studentId' });
    ActivityRating.belongsTo(models.Staff, { foreignKey: 'recordedByStaffId', as: 'recordedBy' });
    ActivityRating.belongsTo(models.Staff, { foreignKey: 'confirmedByStaffId', as: 'confirmedBy' });
  };

  return ActivityRating;
};
