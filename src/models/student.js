const STATUSES = ['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED'];
const DISCOUNT_TYPES = ['PERCENT', 'FLAT'];
const APPLICANT_STATUSES = ['APPLIED', 'SHORTLISTED', 'REJECTED', 'ACCEPTED'];

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
    // A deliberate safeguarding sign-off (see gateLog/service.js's
    // missed-pickup sweep) that this child leaves school on their own — no
    // adult pickup expected, so they must be excluded from the "not picked
    // up yet" alert entirely. Kept as columns here rather than a row in
    // AuthorizedPickupPerson: this is a dismissal *mode* for the child, not
    // a person, and needs to be a cheap single-column filter across the
    // whole school at once, distinct from "no pickup persons configured
    // yet" (an incomplete record) vs. this (an intentional decision).
    selfDismissalAuthorized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    selfDismissalNote: { type: DataTypes.STRING(200), allowNull: true },
    selfDismissalSetByUserId: { type: DataTypes.UUID, allowNull: true },
    selfDismissalSetAt: { type: DataTypes.DATE, allowNull: true },
    // Pre-enrollment applicant pipeline (see modules/admissions) — deliberately
    // separate from the computed admissionStage in students/service.js
    // (derived from class assignment + payment, never stored). null means
    // this row isn't from the public pipeline, which is every existing
    // student and every student the staff AdmissionPage wizard creates.
    // APPLIED/SHORTLISTED/REJECTED are kept out of every normal list
    // (students/service.js#listStudents) until admissions/service.js
    // #acceptApplicant sets this to ACCEPTED — a permanent marker (not
    // cleared to null) so a public applicant's origin and offer-letter
    // verification survive the transition into ordinary enrollment, while
    // still counting as "visible" everywhere null does.
    applicantStatus: { type: DataTypes.ENUM(...APPLICANT_STATUSES), allowNull: true },
    applicantSelfPhone: { type: DataTypes.STRING(30), allowNull: true },
    applicantSelfEmail: { type: DataTypes.STRING, allowNull: true },
    desiredClassLabel: { type: DataTypes.STRING(100), allowNull: true },
    applicationNotes: { type: DataTypes.TEXT, allowNull: true },
    applicationSubmittedAt: { type: DataTypes.DATE, allowNull: true },
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
  Student.APPLICANT_STATUSES = APPLICANT_STATUSES;

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
    Student.belongsTo(models.User, { foreignKey: 'selfDismissalSetByUserId', as: 'selfDismissalSetBy' });
    Student.hasMany(models.AuthorizedPickupPerson, { foreignKey: 'studentId' });
    Student.hasMany(models.GateLogRecord, { foreignKey: 'studentId' });
  };

  return Student;
};
