const AUDIENCES = ['PARENTS', 'TEACHERS'];
const SOURCES = ['COMPOSE', 'DEBT_REMINDER'];

module.exports = (sequelize, DataTypes) => {
  const MessageBatch = sequelize.define('MessageBatch', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    sentByUserId: { type: DataTypes.UUID, allowNull: true },
    audience: { type: DataTypes.ENUM(...AUDIENCES), allowNull: false },
    source: { type: DataTypes.ENUM(...SOURCES), allowNull: false },
    smsRequested: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    emailRequested: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    subject: { type: DataTypes.STRING(200), allowNull: true },
    messageTemplate: { type: DataTypes.TEXT, allowNull: false },
    recipientCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    smsAttempted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    smsSent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    smsFailed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    emailAttempted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    emailSent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    emailFailed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    skippedNoContact: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'message_batches',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'createdAt'] },
    ],
  });

  MessageBatch.AUDIENCES = AUDIENCES;
  MessageBatch.SOURCES = SOURCES;

  MessageBatch.associate = (models) => {
    MessageBatch.belongsTo(models.School, { foreignKey: 'schoolId' });
    MessageBatch.belongsTo(models.User, { foreignKey: 'sentByUserId', as: 'sentBy' });
    MessageBatch.hasMany(models.MessageRecipient, { foreignKey: 'batchId', as: 'recipients' });
  };

  return MessageBatch;
};
