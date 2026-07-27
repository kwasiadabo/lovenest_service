const STATUSES = ['OPEN', 'RESOLVED'];

module.exports = (sequelize, DataTypes) => {
  const Issue = sequelize.define('Issue', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    parentId: { type: DataTypes.UUID, allowNull: false },
    // Optional — a parent can raise a general issue not tied to one child.
    studentId: { type: DataTypes.UUID, allowNull: true },
    subject: { type: DataTypes.STRING(150), allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'OPEN' },
    // Denormalized off IssueMessage so the list view can sort/filter without
    // a join+aggregate on every request — bumped whenever a message is
    // added, same rationale as Bill.totalPesewas being kept off BillItem.
    lastMessageAt: { type: DataTypes.DATE, allowNull: false },
    // Set when the parent opens the issue thread — a staff message with
    // createdAt after this is what drives the parent's "unread reply" flag.
    parentLastReadAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'issues',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'parentId'] },
      { fields: ['schoolId', 'status'] },
    ],
  });

  Issue.STATUSES = STATUSES;

  Issue.associate = (models) => {
    Issue.belongsTo(models.School, { foreignKey: 'schoolId' });
    Issue.belongsTo(models.Parent, { foreignKey: 'parentId' });
    Issue.belongsTo(models.Student, { foreignKey: 'studentId' });
    Issue.hasMany(models.IssueMessage, { foreignKey: 'issueId', as: 'messages' });
  };

  return Issue;
};
