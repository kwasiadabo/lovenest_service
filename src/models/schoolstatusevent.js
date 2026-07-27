// Append-only audit trail for platform-admin tenant actions
// (block/suspend/deactivate/reactivate — see platform/service.js's ACTIONS
// map) and reminder-cron activity (billing/reminderService.js). Not the
// Notification model: that requires a non-null userId + schoolId, but a
// reminder is sent by the platform (no acting user) to a school's own
// contact info, not to a specific User row.
module.exports = (sequelize, DataTypes) => {
  const SchoolStatusEvent = sequelize.define('SchoolStatusEvent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    // null = system/cron (e.g. auto_suspended_non_payment, reminder_sent_*).
    actorUserId: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING(40), allowNull: false },
    previousStatus: { type: DataTypes.STRING(20), allowNull: true },
    newStatus: { type: DataTypes.STRING(20), allowNull: true },
    note: { type: DataTypes.STRING(300), allowNull: true },
  }, {
    tableName: 'school_status_events',
    updatedAt: false,
  });

  SchoolStatusEvent.associate = (models) => {
    SchoolStatusEvent.belongsTo(models.School, { foreignKey: 'schoolId' });
    SchoolStatusEvent.belongsTo(models.User, { foreignKey: 'actorUserId' });
  };

  return SchoolStatusEvent;
};
