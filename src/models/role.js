// Fixed platform roles, per plan §3: SUPER_ADMIN, SCHOOL_ADMIN, ADMINISTRATOR,
// HEAD_TEACHER, TEACHER, ACCOUNTANT, PARENT, DRIVER — these have schoolId
// null. A school can also define its own custom roles (see modules/roles);
// those rows have schoolId set to that school, so they're only ever
// listed/assignable within that one school (see modules/roles/service.js).
module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define('Role', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    description: DataTypes.STRING,
    schoolId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'roles',
    timestamps: false,
  });

  Role.associate = (models) => {
    Role.belongsToMany(models.User, { through: models.UserRole, foreignKey: 'roleId', otherKey: 'userId' });
    Role.belongsTo(models.School, { foreignKey: 'schoolId' });
  };

  return Role;
};
