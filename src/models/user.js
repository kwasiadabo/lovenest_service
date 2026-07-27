module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: {
      // null only for platform SuperAdmin users
      type: DataTypes.UUID,
      allowNull: true,
    },
    fullName: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    status: {
      type: DataTypes.ENUM('active', 'disabled'),
      allowNull: false,
      defaultValue: 'active',
    },
    forcePasswordChange: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    lastLoginAt: DataTypes.DATE,
    resetPasswordTokenHash: { type: DataTypes.STRING, allowNull: true },
    resetPasswordExpiresAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'users',
  });

  User.associate = (models) => {
    User.belongsTo(models.School, { foreignKey: 'schoolId' });
    User.belongsToMany(models.Role, { through: models.UserRole, foreignKey: 'userId', otherKey: 'roleId' });
    User.hasOne(models.Staff, { foreignKey: 'userId' });
  };

  return User;
};
