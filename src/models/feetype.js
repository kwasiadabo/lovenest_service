const CATEGORIES = ['ADMISSION', 'TERM', 'BOOKS', 'UNIFORM', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const FeeType = sequelize.define('FeeType', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false }, // e.g. "Admission Fee", "Books", "PTA Dues"
    category: { type: DataTypes.ENUM(...CATEGORIES), allowNull: false, defaultValue: 'OTHER' },
  }, {
    tableName: 'fee_types',
    indexes: [
      { fields: ['schoolId'] },
      { unique: true, fields: ['schoolId', 'name'] },
    ],
  });

  FeeType.CATEGORIES = CATEGORIES;

  FeeType.associate = (models) => {
    FeeType.belongsTo(models.School, { foreignKey: 'schoolId' });
    FeeType.hasMany(models.FeeAmount, { foreignKey: 'feeTypeId' });
  };

  return FeeType;
};
