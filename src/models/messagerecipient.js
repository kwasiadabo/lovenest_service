const RECIPIENT_TYPES = ['PARENT', 'STAFF'];
const CHANNEL_STATUSES = ['NOT_APPLICABLE', 'SENT', 'FAILED'];

module.exports = (sequelize, DataTypes) => {
  const MessageRecipient = sequelize.define('MessageRecipient', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    batchId: { type: DataTypes.UUID, allowNull: false },
    recipientType: { type: DataTypes.ENUM(...RECIPIENT_TYPES), allowNull: false },
    parentId: { type: DataTypes.UUID, allowNull: true },
    staffId: { type: DataTypes.UUID, allowNull: true },
    // Set only for DEBT_REMINDER rows — which child this parent was
    // reminded about (see financials' sendDebtReminders).
    studentId: { type: DataTypes.UUID, allowNull: true },
    // Denormalized snapshots — survive later edits/deletes to the source
    // Parent/Staff record, so the audit trail always reflects what was
    // actually sent.
    recipientName: { type: DataTypes.STRING, allowNull: false },
    phoneUsed: { type: DataTypes.STRING(30), allowNull: true },
    emailUsed: { type: DataTypes.STRING, allowNull: true },
    smsStatus: { type: DataTypes.ENUM(...CHANNEL_STATUSES), allowNull: false, defaultValue: 'NOT_APPLICABLE' },
    smsError: { type: DataTypes.STRING(500), allowNull: true },
    emailStatus: { type: DataTypes.ENUM(...CHANNEL_STATUSES), allowNull: false, defaultValue: 'NOT_APPLICABLE' },
    emailError: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'message_recipients',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['batchId'] },
    ],
  });

  MessageRecipient.RECIPIENT_TYPES = RECIPIENT_TYPES;
  MessageRecipient.CHANNEL_STATUSES = CHANNEL_STATUSES;

  MessageRecipient.associate = (models) => {
    MessageRecipient.belongsTo(models.School, { foreignKey: 'schoolId' });
    MessageRecipient.belongsTo(models.MessageBatch, { foreignKey: 'batchId', as: 'batch' });
    MessageRecipient.belongsTo(models.Parent, { foreignKey: 'parentId' });
    MessageRecipient.belongsTo(models.Staff, { foreignKey: 'staffId' });
    MessageRecipient.belongsTo(models.Student, { foreignKey: 'studentId' });
  };

  return MessageRecipient;
};
