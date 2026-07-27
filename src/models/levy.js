const TARGET_TYPES = ['SCHOOL', 'CLASS'];
const STATUSES = ['ACTIVE', 'CLOSED'];

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
    // CLASS = only students in the classes listed via LevyClassAmount owe it.
    targetType: { type: DataTypes.ENUM(...TARGET_TYPES), allowNull: false },
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

  Levy.associate = (models) => {
    Levy.belongsTo(models.School, { foreignKey: 'schoolId' });
    Levy.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    Levy.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    Levy.hasMany(models.LevyClassAmount, { foreignKey: 'levyId', as: 'classAmounts' });
    Levy.hasMany(models.LevyPayment, { foreignKey: 'levyId', as: 'payments' });
  };

  return Levy;
};
