// Fixed platform roles, per plan §3: SUPER_ADMIN, SCHOOL_ADMIN, ADMINISTRATOR,
// HEAD_TEACHER, TEACHER, ACCOUNTANT, PARENT
module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define('Role', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    description: DataTypes.STRING,
  }, {
    tableName: 'roles',
    timestamps: false,
  });

  Role.associate = (models) => {
    Role.belongsToMany(models.User, { through: models.UserRole, foreignKey: 'roleId', otherKey: 'userId' });
  };

  return Role;
};
