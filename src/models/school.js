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
    // Uploaded by the school's own admin via Settings (see schoolSettings
    // module) — a school-level image rather than tied to a specific Staff
    // record, since there's no canonical "the headteacher" record (Staff
    // .position and the HEAD_TEACHER auth role are unrelated and neither is
    // unique per school). Printed on report cards in place of the blank
    // signature line once set.
    headteacherSignatureUrl: DataTypes.STRING,
    // Free-text note shown on printed/downloaded bills alongside the payment
    // accounts (e.g. "Pay before the 5th of each month" or bank-specific
    // notes) — school-level since it applies to every bill, not tied to a
    // single PaymentAccount row.
    paymentInstructions: DataTypes.TEXT,
    // Up to two "#rrggbb" hex colors chosen by the school's own admin via
    // Settings — used only on documents meant to carry the school's own
    // look (currently just the student ID card), never for the admin app's
    // own chrome (see tenantAccentColor.js's note on why the signed-in app
    // itself stays on the fixed product brand color). brandColorSecondary is
    // optional even when brandColor is set — a template that only needs one
    // color (e.g. "classic") just ignores it. Null = fall back to the
    // template's own fixed default color(s).
    brandColor: { type: DataTypes.STRING(7), allowNull: true },
    brandColorSecondary: { type: DataTypes.STRING(7), allowNull: true },
    // Which of the id-card templates (see frontend's idCardTemplates/) this
    // school's cards render as — a school-wide choice, not per-card, so
    // every generated/printed card stays visually consistent.
    idCardTemplate: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'classic' },
    // Vestigial: leftover from the multi-tenant SaaS version of this app
    // (self-serve onboarding, platform billing/suspension). Single-tenant
    // Lovenest is always 'active' — kept as unused columns rather than a
    // destructive migration; see auth/service.js's login() for the one
    // remaining (inert) read of `status`.
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    planCode: { type: DataTypes.STRING(30), allowNull: true },
    subscriptionExpiresAt: { type: DataTypes.DATE, allowNull: true },
    studentPopulation: { type: DataTypes.INTEGER, allowNull: false },
    smsAllowance: { type: DataTypes.INTEGER, allowNull: true },
    smsUsedThisCycle: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    statusReason: { type: DataTypes.STRING(30), allowNull: true },
    statusChangedAt: { type: DataTypes.DATE, allowNull: true },
    statusChangedByUserId: { type: DataTypes.UUID, allowNull: true },
    reminder14SentAt: { type: DataTypes.DATE, allowNull: true },
    reminder3SentAt: { type: DataTypes.DATE, allowNull: true },
    termGraceEndsAt: { type: DataTypes.DATE, allowNull: true },
    termPaymentPromptSentAt: { type: DataTypes.DATE, allowNull: true },
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
    // Report card extras — both null/unset by default (feature simply
    // doesn't render until a school opts in, see
    // reportCards/service.js#buildReportCardPayload). passMarkPercent drives
    // subjects-passed/failed; bestAggregateSubjectCount only ever applies
    // when every one of the school's own GradeBand.grade values parses as an
    // integer (a BECE-style 1-9 scale) — on a letter scale (A/B/C...) there's
    // no numeric grade-point to sum, so that stat is omitted regardless of
    // this setting.
    passMarkPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    bestAggregateSubjectCount: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 6 },
    // Sibling discount on TERM fees, applied per family (students sharing a
    // Parent record) when generating bills — see financials/service.js
    // #resolveSiblingDiscountPercent. Both default to 0 (no discount).
    thirdChildDiscountPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    fourthChildAndAboveDiscountPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    // Daily attendance windows, admin/headmaster-configurable (see
    // attendance/service.js#getAttendanceSettings). Plain "HH:MM" 24h
    // strings, same convention as timetable_periods.startTime/endTime and
    // transport_routes.scheduledTime — never a SQL TIME column. A student
    // marked at/before latenessCutoffTime is Present, up to
    // autoAbsentCutoffTime is Late, after that Absent.
    attendanceReportingTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '08:00' },
    attendanceLatenessCutoffTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '08:15' },
    attendanceAutoAbsentCutoffTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '10:00' },
    // Admin/headmaster-configurable school-day-end time, read by
    // gateLog/service.js#runMissedPickupSweep to flag a checked-in student
    // with no checkout recorded. Same "HH:MM" string convention as the
    // attendance times above.
    gateLogDismissalTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '15:00' },
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
  };

  return School;
};
