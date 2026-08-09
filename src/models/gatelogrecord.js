// A student checks in once and checks out once per day — one mutable row
// per (studentId, date), same convention as AttendanceRecord/PickupRecord/
// DropoffRecord, rather than two append-only event rows. Simpler for the
// front desk (a 3-state machine: NOT_IN -> CHECKED_IN -> CHECKED_OUT) and
// simpler for the missed-pickup sweep to scan (one WHERE clause) than
// reconstructing state from two tables.
const CHECKED_OUT_BY_TYPES = ['PARENT', 'AUTHORIZED_PERSON', 'SELF_DISMISSAL', 'OVERRIDE'];

module.exports = (sequelize, DataTypes) => {
  const GateLogRecord = sequelize.define('GateLogRecord', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },

    checkedInAt: { type: DataTypes.DATE, allowNull: true },
    // Free text — no verification required on drop-off, only pickup needs
    // the authorized-list check (see gateLog/service.js#recordCheckOut).
    checkedInByName: { type: DataTypes.STRING(150), allowNull: true },
    checkedInByRelationship: { type: DataTypes.STRING(50), allowNull: true },
    recordedInByUserId: { type: DataTypes.UUID, allowNull: true },

    checkedOutAt: { type: DataTypes.DATE, allowNull: true },
    checkedOutByType: { type: DataTypes.STRING(20), allowNull: true },
    checkedOutByParentId: { type: DataTypes.UUID, allowNull: true },
    checkedOutByAuthorizedPersonId: { type: DataTypes.UUID, allowNull: true },
    // Always populated when checked out (except SELF_DISMISSAL, which has no
    // name): a snapshot of the matched Parent/AuthorizedPickupPerson's name,
    // or the override-typed name — durable even if that source row is later
    // renamed or deactivated.
    checkedOutByName: { type: DataTypes.STRING(150), allowNull: true },
    checkedOutByRelationship: { type: DataTypes.STRING(50), allowNull: true },
    // True iff checkedOutByType = OVERRIDE — never true for SELF_DISMISSAL,
    // which is pre-authorized, not an exception. Stored directly (not
    // re-derived) so a safeguarding audit report never has to reconstruct it.
    wasUnauthorizedPickup: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    recordedOutByUserId: { type: DataTypes.UUID, allowNull: true },

    // Idempotency guard for the missed-pickup sweep — once set, this row is
    // never re-alerted for the rest of the day regardless of how many times
    // the cron ticks past the dismissal threshold.
    alertSentAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'gate_log_records',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['studentId', 'date'], name: 'gate_log_records_unique_student_date' },
      { fields: ['schoolId', 'date'] },
    ],
  });

  GateLogRecord.CHECKED_OUT_BY_TYPES = CHECKED_OUT_BY_TYPES;

  GateLogRecord.associate = (models) => {
    GateLogRecord.belongsTo(models.School, { foreignKey: 'schoolId' });
    GateLogRecord.belongsTo(models.Student, { foreignKey: 'studentId' });
    GateLogRecord.belongsTo(models.Parent, { foreignKey: 'checkedOutByParentId', as: 'checkedOutByParent' });
    GateLogRecord.belongsTo(models.AuthorizedPickupPerson, {
      foreignKey: 'checkedOutByAuthorizedPersonId', as: 'checkedOutByAuthorizedPerson',
    });
    GateLogRecord.belongsTo(models.User, { foreignKey: 'recordedInByUserId', as: 'recordedInBy' });
    GateLogRecord.belongsTo(models.User, { foreignKey: 'recordedOutByUserId', as: 'recordedOutBy' });
  };

  return GateLogRecord;
};
