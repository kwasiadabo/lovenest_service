const STATUSES = ['ACTIVE', 'INACTIVE'];

module.exports = (sequelize, DataTypes) => {
  const AuthorizedPickupPerson = sequelize.define('AuthorizedPickupPerson', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    fullName: { type: DataTypes.STRING(150), allowNull: false },
    // Free text, unlike StudentParent's fixed FATHER/MOTHER enum — real
    // authorized adults (grandparent, driver, nanny) don't fit a closed set.
    relationship: { type: DataTypes.STRING(50), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    notes: { type: DataTypes.STRING(200), allowNull: true },
    // Soft-remove, same convention as Vehicle.status — deactivating (not
    // deleting) preserves FK integrity for historical GateLogRecord rows
    // that reference this person as who picked the student up that day.
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'ACTIVE' },
    addedByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'authorized_pickup_persons',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'studentId'] },
    ],
  });

  AuthorizedPickupPerson.STATUSES = STATUSES;

  AuthorizedPickupPerson.associate = (models) => {
    AuthorizedPickupPerson.belongsTo(models.School, { foreignKey: 'schoolId' });
    AuthorizedPickupPerson.belongsTo(models.Student, { foreignKey: 'studentId' });
    AuthorizedPickupPerson.belongsTo(models.User, { foreignKey: 'addedByUserId', as: 'addedBy' });
    AuthorizedPickupPerson.hasMany(models.GateLogRecord, { foreignKey: 'checkedOutByAuthorizedPersonId' });
  };

  return AuthorizedPickupPerson;
};
