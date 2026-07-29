const TARGET_TYPES = ['SCHOOL', 'CLASS', 'STUDENT'];
const STATUSES = ['ACTIVE', 'CLOSED'];
const FREQUENCIES = ['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'TERMLY'];

module.exports = (sequelize, DataTypes) => {
  const Levy = sequelize.define('Levy', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    academicYearId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false }, // e.g. "Graduation Fee", "Canteen Fee"
    description: { type: DataTypes.STRING(500), allowNull: true },
    // SCHOOL = every active student owes it (unless a class override applies);
    // CLASS = only students in the classes listed via LevyClassAmount owe it;
    // STUDENT = only the specific students listed via LevyStudent owe it
    // (e.g. a canteen fee opted into per-pupil rather than by class/school).
    // Plain string, not DataTypes.ENUM — see
    // migrations/20260101000117-convert-levy-target-type-to-string.js for
    // why (SQL Server ENUM = CHECK constraint, painful to extend later).
    targetType: { type: DataTypes.STRING(20), allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
    // At most one levy per school is flagged — the transport module's
    // debtor report and parent-facing fee balance read whichever levy this
    // is true on. Same "unset-all-then-set-one" pattern as
    // AcademicYear.isCurrent/Term.isCurrent.
    isTransportFee: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // ONE_TIME (default) = amountPesewas is owed once, forever — the
    // original/only behavior before periodic fees existed. DAILY/WEEKLY/
    // MONTHLY/TERMLY = amountPesewas is owed once per elapsed period since
    // startDate (required for these), and debt accumulates across missed
    // periods rather than resetting — see levies/service.js#periodsElapsed/
    // #applyFrequency, the only place this multiplication happens. TERMLY
    // periods are the school's actual Term rows for this levy's
    // academicYearId, not a fixed day count.
    frequency: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ONE_TIME' },
  }, {
    tableName: 'levies',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['academicYearId'] },
      { fields: ['status'] },
    ],
  });

  Levy.TARGET_TYPES = TARGET_TYPES;
  Levy.STATUSES = STATUSES;
  Levy.FREQUENCIES = FREQUENCIES;

  Levy.associate = (models) => {
    Levy.belongsTo(models.School, { foreignKey: 'schoolId' });
    Levy.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    Levy.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    Levy.hasMany(models.LevyClassAmount, { foreignKey: 'levyId', as: 'classAmounts' });
    Levy.hasMany(models.LevyStudent, { foreignKey: 'levyId', as: 'levyStudents' });
    Levy.hasMany(models.LevyPayment, { foreignKey: 'levyId', as: 'payments' });
  };

  return Levy;
};
