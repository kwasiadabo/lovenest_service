const REQUEST_TYPES = ['LEAVE', 'DUTY_EXCUSE'];
const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'PERSONAL', 'UNPAID', 'OTHER'];
const STATUSES = ['PENDING', 'APPROVED', 'DENIED'];

module.exports = (sequelize, DataTypes) => {
  const StaffLeaveRequest = sequelize.define('StaffLeaveRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
    requestType: { type: DataTypes.ENUM(...REQUEST_TYPES), allowNull: false },
    leaveType: { type: DataTypes.ENUM(...LEAVE_TYPES), allowNull: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.STRING(1000), allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PENDING' },
    requestedByUserId: { type: DataTypes.UUID, allowNull: false },
    decidedByUserId: { type: DataTypes.UUID, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    decisionNotes: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'staff_leave_requests',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'staffId'] },
      { fields: ['schoolId', 'status'] },
    ],
  });

  StaffLeaveRequest.REQUEST_TYPES = REQUEST_TYPES;
  StaffLeaveRequest.LEAVE_TYPES = LEAVE_TYPES;
  StaffLeaveRequest.STATUSES = STATUSES;

  StaffLeaveRequest.associate = (models) => {
    StaffLeaveRequest.belongsTo(models.School, { foreignKey: 'schoolId' });
    StaffLeaveRequest.belongsTo(models.Staff, { foreignKey: 'staffId' });
    StaffLeaveRequest.belongsTo(models.User, { foreignKey: 'requestedByUserId', as: 'requestedBy' });
    StaffLeaveRequest.belongsTo(models.User, { foreignKey: 'decidedByUserId', as: 'decidedBy' });
  };

  return StaffLeaveRequest;
};
