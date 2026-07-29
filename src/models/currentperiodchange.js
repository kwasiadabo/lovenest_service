const ENTITY_TYPES = ['ACADEMIC_YEAR', 'TERM'];

module.exports = (sequelize, DataTypes) => {
  const CurrentPeriodChange = sequelize.define('CurrentPeriodChange', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    entityType: { type: DataTypes.ENUM(...ENTITY_TYPES), allowNull: false },
    // Deliberately not DB-level FKs — same rationale as JournalEntry.sourceId:
    // this is an audit trail and must stay legible even if the referenced
    // year/term is later renamed or deleted. Labels are snapshotted at the
    // time of change for the same reason.
    previousCurrentId: { type: DataTypes.UUID, allowNull: true },
    previousCurrentLabel: { type: DataTypes.STRING(50), allowNull: true },
    newCurrentId: { type: DataTypes.UUID, allowNull: false },
    newCurrentLabel: { type: DataTypes.STRING(50), allowNull: false },
    changedByUserId: { type: DataTypes.UUID, allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: false },
  }, {
    tableName: 'current_period_changes',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'entityType'] },
    ],
  });

  CurrentPeriodChange.ENTITY_TYPES = ENTITY_TYPES;

  CurrentPeriodChange.associate = (models) => {
    CurrentPeriodChange.belongsTo(models.School, { foreignKey: 'schoolId' });
    CurrentPeriodChange.belongsTo(models.User, { foreignKey: 'changedByUserId', as: 'changedBy' });
  };

  return CurrentPeriodChange;
};
