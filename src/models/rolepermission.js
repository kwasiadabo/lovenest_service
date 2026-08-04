const LEVELS = ['NONE', 'VIEW', 'CONTRIBUTE', 'MANAGE'];

module.exports = (sequelize, DataTypes) => {
  const RolePermission = sequelize.define('RolePermission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    // A role name — one of the fixed built-in roles (config/permissions.js's
    // EDITABLE_ROLES) or a school-defined custom role (modules/roles). Kept
    // as a plain STRING rather than an ENUM (same reasoning as moduleKey
    // below) so a school can add a custom role without a migration.
    role: { type: DataTypes.STRING(50), allowNull: false },
    // Matches a moduleKey from config/permissions.js's MODULES list — kept
    // as a plain STRING rather than an ENUM here so adding a new module
    // later doesn't require a column-type migration, only an addition to
    // that config file.
    moduleKey: { type: DataTypes.STRING(50), allowNull: false },
    level: { type: DataTypes.ENUM(...LEVELS), allowNull: false },
  }, {
    tableName: 'role_permissions',
    indexes: [
      { fields: ['schoolId'] },
      {
        unique: true, fields: ['schoolId', 'role', 'moduleKey'], name: 'role_permissions_unique_scope',
      },
    ],
  });

  RolePermission.associate = (models) => {
    RolePermission.belongsTo(models.School, { foreignKey: 'schoolId' });
  };

  return RolePermission;
};
