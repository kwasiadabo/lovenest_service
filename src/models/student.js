const STATUSES = ['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED'];
const DISCOUNT_TYPES = ['PERCENT', 'FLAT'];

module.exports = (sequelize, DataTypes) => {
  const Student = sequelize.define('Student', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentNumber: { type: DataTypes.STRING(30), allowNull: false },
    firstName: { type: DataTypes.STRING, allowNull: false },
    middleName: { type: DataTypes.STRING, allowNull: true },
    lastName: { type: DataTypes.STRING, allowNull: false },
    // Derived for display — not a column, so ORDER BY must use
    // lastName/firstName directly instead.
    fullName: {
      type: DataTypes.VIRTUAL,
      get() {
        return [this.firstName, this.middleName, this.lastName].filter(Boolean).join(' ');
      },
    },
    gender: { type: DataTypes.ENUM('MALE', 'FEMALE'), allowNull: false },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: false },
    allergies: { type: DataTypes.STRING(500), allowNull: true },
    emergencyContactName: { type: DataTypes.STRING, allowNull: false },
    emergencyContactPhone: { type: DataTypes.STRING(30), allowNull: false },
    emergencyContactRelationship: { type: DataTypes.STRING(50), allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    admissionDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
    statusDate: { type: DataTypes.DATEONLY, allowNull: true },
    statusNote: { type: DataTypes.STRING, allowNull: true },
    photoUrl: { type: DataTypes.STRING, allowNull: true },
    // A per-student concession (e.g. staff-child, hardship case), applied to
    // TERM fees whenever bills are generated — see financials/service.js
    // #syncStudentDiscount. null type = no individual discount. Overrides
    // (doesn't stack with) the school-wide sibling discount for this student.
    individualDiscountType: { type: DataTypes.STRING(10), allowNull: true },
    individualDiscountPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    individualDiscountFlatPesewas: { type: DataTypes.INTEGER, allowNull: true },
    individualDiscountReason: { type: DataTypes.STRING(200), allowNull: true },
  }, {
    tableName: 'students',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'status'] },
      { unique: true, fields: ['schoolId', 'studentNumber'] },
    ],
  });

  Student.STATUSES = STATUSES;
  Student.DISCOUNT_TYPES = DISCOUNT_TYPES;

  Student.associate = (models) => {
    Student.belongsTo(models.School, { foreignKey: 'schoolId' });
    Student.hasMany(models.StudentClassAssignment, { foreignKey: 'studentId' });
    Student.hasOne(models.AdmissionPayment, { foreignKey: 'studentId' });
    Student.hasMany(models.Bill, { foreignKey: 'studentId' });
    Student.hasMany(models.BillPayment, { foreignKey: 'studentId' });
    Student.belongsToMany(models.Parent, {
      through: models.StudentParent,
      as: 'parents',
      foreignKey: 'studentId',
      otherKey: 'parentId',
    });
  };

  return Student;
};
