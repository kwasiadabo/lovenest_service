// Reuses ActivityRating's exact rating vocabulary for consistency (see
// activityrating.js) — but deliberately no draft/confirm workflow here,
// simpler than ActivityRating on purpose.
const RATINGS = ['BEGINNING', 'DEVELOPING', 'PROFICIENT', 'EXCELLING'];

module.exports = (sequelize, DataTypes) => {
  const StaffAppraisal = sequelize.define('StaffAppraisal', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
    reviewerStaffId: { type: DataTypes.UUID, allowNull: false },
    reviewDate: { type: DataTypes.DATEONLY, allowNull: false },
    rating: { type: DataTypes.ENUM(...RATINGS), allowNull: false },
    comments: { type: DataTypes.STRING(2000), allowNull: true },
  }, {
    tableName: 'staff_appraisals',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'staffId'] },
    ],
  });

  StaffAppraisal.RATINGS = RATINGS;

  StaffAppraisal.associate = (models) => {
    StaffAppraisal.belongsTo(models.School, { foreignKey: 'schoolId' });
    StaffAppraisal.belongsTo(models.Staff, { foreignKey: 'staffId' });
    // Aliased — a second belongsTo to the same target model (Staff) needs an
    // `as` to avoid Sequelize's ambiguous-association error; the reverse
    // (Staff.hasMany for the reviewer side) is deliberately skipped per the
    // plan, since nothing in this feature needs to query "appraisals I
    // reviewed" from the Staff side yet.
    StaffAppraisal.belongsTo(models.Staff, { foreignKey: 'reviewerStaffId', as: 'reviewer' });
  };

  return StaffAppraisal;
};
