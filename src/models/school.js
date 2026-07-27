module.exports = (sequelize, DataTypes) => {
  const School = sequelize.define('School', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    // The prefix on every student's studentNumber (e.g. "UG-2026-004501") —
    // mandatory and globally unique, not just per-tenant, since it's the only
    // thing that disambiguates two schools' student numbers from each other.
    code: { type: DataTypes.STRING(3), allowNull: false, unique: true },
    address: DataTypes.STRING,
    phone: DataTypes.STRING(30),
    email: DataTypes.STRING,
    logoUrl: DataTypes.STRING,
    // 'pending' (provisioned, no plan chosen yet) -> 'trial' | 'active' (plan
    // chosen; 'active' after a paid plan is verified) -> 'suspended'.
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    planCode: { type: DataTypes.STRING(30), allowNull: true },
    subscriptionExpiresAt: { type: DataTypes.DATE, allowNull: true },
    // Captured once at onboarding — the only population figure available
    // before any payment exists. Every renewal after the first successful
    // payment instead re-evaluates the tier from a live COUNT of ACTIVE
    // students (see billing/service.js#resolveCurrentTier), so this field is
    // never updated after onboarding.
    studentPopulation: { type: DataTypes.INTEGER, allowNull: false },
    // Snapshotted from the resolved plan at each startTrial/successful
    // payment (see billing/service.js) so historical reporting reflects what
    // the bundle *was*, even if config/plans.js pricing changes later.
    smsAllowance: { type: DataTypes.INTEGER, allowNull: true },
    smsUsedThisCycle: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // Set only when status === 'suspended', to distinguish *why* — the 4
    // platform-admin actions (block/suspend/deactivate) and the reminder
    // cron's auto-suspend all set this alongside status; reactivating clears
    // it back to null. See platform/service.js's ACTIONS map.
    statusReason: { type: DataTypes.STRING(30), allowNull: true },
    statusChangedAt: { type: DataTypes.DATE, allowNull: true },
    // null = system/cron (e.g. non_payment_auto), not a platform admin.
    statusChangedByUserId: { type: DataTypes.UUID, allowNull: true },
    // Idempotency flags for the daily reminder cron (billing/reminderService.js)
    // — reset to null whenever subscriptionExpiresAt is extended (startTrial,
    // applySuccessfulPayment), so a renewed school gets reminded again next cycle.
    reminder14SentAt: { type: DataTypes.DATE, allowNull: true },
    reminder3SentAt: { type: DataTypes.DATE, allowNull: true },
    // Per-tenant SMS/email sending credentials — each school sends under its
    // own identity rather than a shared platform account. All optional: a
    // school can register without them and add them later via Settings: SMS
    // and email simply stay unconfigured (skipped, not an error) until set.
    // NALO_API_KEY itself stays a platform-wide env var — only the display
    // Sender ID is per-school.
    smsSenderId: { type: DataTypes.STRING(20), allowNull: true },
    emailUser: { type: DataTypes.STRING, allowNull: true },
    // Encrypted at rest (see utils/secretCrypto.js) — never the plaintext
    // Gmail App Password, and never selected in any query whose result
    // reaches a JSON response (see tenantScopedModel/service-layer usage).
    emailAppPasswordEncrypted: { type: DataTypes.STRING(500), allowNull: true },
    // Classwork(CA)/exam weighting for the gradebook (ExamScore.caScaled/
    // examScaled/totalScore) — defaults preserve the split that used to be
    // hardcoded in assessment/service.js. Always read via
    // gradingSettings/service.js#resolveGradingConfig, not directly, so the
    // "no saved grade bands yet" default-fallback logic stays in one place.
    caWeight: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0.3 },
    examWeight: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0.7 },
    // MANUAL: the classwork figure on Exam Scores is typed in by the teacher
    // (today's only behavior). COMPUTED: it's derived automatically from the
    // school's Classwork-item average and Project-item average, blended by
    // classworkWeight/projectWeight (same 0-1, sum-to-1 convention as
    // caWeight/examWeight above). Always read via
    // gradingSettings/service.js#resolveGradingConfig.
    classworkSourceMode: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MANUAL' },
    classworkWeight: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0.5 },
    projectWeight: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0.5 },
    // Sibling discount on TERM fees, applied per family (students sharing a
    // Parent record) when generating bills — see financials/service.js
    // #resolveSiblingDiscountPercent. Both default to 0 (no discount).
    thirdChildDiscountPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    fourthChildAndAboveDiscountPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'schools',
  });

  School.associate = (models) => {
    School.hasMany(models.User, { foreignKey: 'schoolId' });
    School.hasMany(models.AcademicYear, { foreignKey: 'schoolId' });
    School.hasMany(models.Level, { foreignKey: 'schoolId' });
    School.hasMany(models.Class, { foreignKey: 'schoolId' });
    School.hasMany(models.Subject, { foreignKey: 'schoolId' });
    School.hasMany(models.Payment, { foreignKey: 'schoolId' });
    School.hasMany(models.Staff, { foreignKey: 'schoolId' });
    School.hasMany(models.SubjectTeacher, { foreignKey: 'schoolId' });
    School.hasMany(models.ClassTeacher, { foreignKey: 'schoolId' });
    School.hasMany(models.StaffDuty, { foreignKey: 'schoolId' });
    School.hasMany(models.DutyRoster, { foreignKey: 'schoolId' });
    School.hasMany(models.GradeBand, { foreignKey: 'schoolId' });
    School.hasMany(models.SchoolStatusEvent, { foreignKey: 'schoolId' });
    School.hasOne(models.TrainingEnrollment, { foreignKey: 'schoolId' });
  };

  return School;
};
