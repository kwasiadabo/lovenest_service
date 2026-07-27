const AUTHOR_ROLES = ['PARENT', 'STAFF'];

module.exports = (sequelize, DataTypes) => {
  const IssueMessage = sequelize.define('IssueMessage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    issueId: { type: DataTypes.UUID, allowNull: false },
    authorUserId: { type: DataTypes.UUID, allowNull: false },
    // Denormalized off the author's role at post time — who counts as
    // "staff" can change later (role edits), but a message should always
    // display as having come from whichever side sent it.
    authorRole: { type: DataTypes.ENUM(...AUTHOR_ROLES), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
  }, {
    tableName: 'issue_messages',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'issueId'] },
    ],
  });

  IssueMessage.AUTHOR_ROLES = AUTHOR_ROLES;

  IssueMessage.associate = (models) => {
    IssueMessage.belongsTo(models.School, { foreignKey: 'schoolId' });
    IssueMessage.belongsTo(models.Issue, { foreignKey: 'issueId' });
    IssueMessage.belongsTo(models.User, { foreignKey: 'authorUserId', as: 'author' });
  };

  return IssueMessage;
};
