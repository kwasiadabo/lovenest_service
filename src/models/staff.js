const POSITIONS = [
  'Headteacher',
  'Headmaster',
  'Assistant Headteacher',
  'Assistant Headmaster',
  'Teacher',
  'Administrator',
  'Accountant',
  'Secretary',
  'Librarian',
  'Store Keeper',
  'Cleaner',
  'Security',
  'Cook',
  'Driver',
  'Nurse',
  'Other',
];

module.exports = (sequelize, DataTypes) => {
  const Staff = sequelize.define('Staff', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
    fullName: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    // Nullable — see the add-gender-to-staff migration's comment.
    gender: { type: DataTypes.ENUM('MALE', 'FEMALE'), allowNull: true },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: false },
    dateHired: { type: DataTypes.DATEONLY, allowNull: false },
    position: { type: DataTypes.ENUM(...POSITIONS), allowNull: false },
    staffType: { type: DataTypes.ENUM('TEACHING', 'NON_TEACHING'), allowNull: false },
    qualification: { type: DataTypes.STRING, allowNull: false },
    bankName: { type: DataTypes.STRING(100), allowNull: true },
    bankBranch: { type: DataTypes.STRING(100), allowNull: true },
    bankAccountNumber: { type: DataTypes.STRING(50), allowNull: true },
    bankAccountName: { type: DataTypes.STRING(150), allowNull: true },
    // Both surfaced on the SSNIT/PAYE statutory returns (payroll module) —
    // SSNIT number on the SSNIT return, Ghana Card number/TIN on the PAYE
    // return.
    ssnitNumber: { type: DataTypes.STRING(30), allowNull: true },
    ghanaCardNumber: { type: DataTypes.STRING(30), allowNull: true },
  }, {
    tableName: 'staff',
    indexes: [
      { fields: ['schoolId'] },
    ],
  });

  Staff.POSITIONS = POSITIONS;
  // Positions whose staffType is implied, not a free choice — the service
  // layer (staff/service.js) forces staffType to 'TEACHING' whenever
  // `position` is one of these, regardless of what the client submitted.
  Staff.TEACHING_POSITIONS = ['Headteacher', 'Headmaster', 'Assistant Headteacher', 'Assistant Headmaster', 'Teacher'];

  Staff.associate = (models) => {
    Staff.belongsTo(models.School, { foreignKey: 'schoolId' });
    Staff.belongsTo(models.User, { foreignKey: 'userId' });
    Staff.belongsToMany(models.Class, {
      through: models.ClassTeacher,
      as: 'classTeacherOf',
      foreignKey: 'staffId',
      otherKey: 'classId',
    });
    Staff.hasMany(models.SubjectTeacher, { foreignKey: 'staffId' });
    Staff.hasMany(models.DutyRoster, { foreignKey: 'staffId' });
  };

  return Staff;
};
