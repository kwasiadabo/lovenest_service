module.exports = (sequelize, DataTypes) => {
  const Parent = sequelize.define('Parent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    fullName: { type: DataTypes.STRING, allowNull: false },
    // The natural dedup key: re-enrolling a sibling with the same phone
    // number links to this same parent record instead of creating a new one.
    phone: { type: DataTypes.STRING(30), allowNull: false },
    email: { type: DataTypes.STRING, allowNull: true },
    // Links to a portal login, created on demand (not at Parent-creation
    // time) via students/service.js#createParentLogin. The filtered unique
    // index enforcing "unique among non-null values" is raw SQL in the
    // migration — Sequelize's index options can't express it.
    userId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'parents',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'phone'] },
    ],
  });

  Parent.associate = (models) => {
    Parent.belongsTo(models.School, { foreignKey: 'schoolId' });
    Parent.belongsTo(models.User, { foreignKey: 'userId' });
    Parent.belongsToMany(models.Student, {
      through: models.StudentParent,
      as: 'children',
      foreignKey: 'parentId',
      otherKey: 'studentId',
    });
  };

  return Parent;
};
