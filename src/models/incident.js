const SUBJECT_TYPES = ['STUDENT', 'STAFF'];
const CATEGORIES = [
  'BULLYING',
  'FIGHTING',
  'PROPERTY_DAMAGE',
  'ACADEMIC_DISHONESTY',
  'INSUBORDINATION',
  'ATTENDANCE',
  'MISCONDUCT',
  'SAFETY',
  'OTHER',
];
const SEVERITIES = ['MINOR', 'MAJOR', 'SEVERE'];
const STATUSES = ['OPEN', 'RESOLVED'];
const ACTION_TYPES = [
  'VERBAL_WARNING',
  'WRITTEN_WARNING',
  'DETENTION',
  'SUSPENSION',
  'PARENT_MEETING',
  'PROBATION',
  'TERMINATION',
  'OTHER',
];
const ACTION_STATUSES = ['PENDING', 'COMPLETED'];

module.exports = (sequelize, DataTypes) => {
  const Incident = sequelize.define('Incident', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    subjectType: { type: DataTypes.STRING(10), allowNull: false },
    // Exactly one of these two is set, matching subjectType — see
    // incidents/service.js, which is the only place that enforces it.
    studentId: { type: DataTypes.UUID, allowNull: true },
    staffId: { type: DataTypes.UUID, allowNull: true },
    incidentDate: { type: DataTypes.DATEONLY, allowNull: false },
    category: { type: DataTypes.STRING(30), allowNull: false },
    severity: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'MINOR' },
    description: { type: DataTypes.STRING(2000), allowNull: false },
    reportedByUserId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'OPEN' },
    // A disciplinary action is optional and set/updated after the fact, once
    // a decision is made — null until then (see incidents/service.js#recordAction).
    actionType: { type: DataTypes.STRING(30), allowNull: true },
    actionDate: { type: DataTypes.DATEONLY, allowNull: true },
    actionDetails: { type: DataTypes.STRING(500), allowNull: true },
    actionStatus: { type: DataTypes.STRING(10), allowNull: true },
  }, {
    tableName: 'incidents',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'studentId'] },
      { fields: ['schoolId', 'staffId'] },
      { fields: ['schoolId', 'status'] },
    ],
  });

  Incident.SUBJECT_TYPES = SUBJECT_TYPES;
  Incident.CATEGORIES = CATEGORIES;
  Incident.SEVERITIES = SEVERITIES;
  Incident.STATUSES = STATUSES;
  Incident.ACTION_TYPES = ACTION_TYPES;
  Incident.ACTION_STATUSES = ACTION_STATUSES;

  Incident.associate = (models) => {
    Incident.belongsTo(models.School, { foreignKey: 'schoolId' });
    Incident.belongsTo(models.Student, { foreignKey: 'studentId' });
    Incident.belongsTo(models.Staff, { foreignKey: 'staffId' });
    Incident.belongsTo(models.User, { foreignKey: 'reportedByUserId', as: 'reportedBy' });
  };

  return Incident;
};
