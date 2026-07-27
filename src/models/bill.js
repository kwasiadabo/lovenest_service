const STATUSES = ['PROVISIONAL', 'CONFIRMED'];

module.exports = (sequelize, DataTypes) => {
  const Bill = sequelize.define('Bill', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    academicYearId: { type: DataTypes.UUID, allowNull: false },
    termId: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PROVISIONAL' },
    totalPesewas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    confirmedByUserId: { type: DataTypes.UUID, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'bills',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['studentId'] },
      { fields: ['termId'] },
      { fields: ['status'] },
      { unique: true, fields: ['studentId', 'termId'] },
    ],
  });

  Bill.STATUSES = STATUSES;

  Bill.associate = (models) => {
    Bill.belongsTo(models.School, { foreignKey: 'schoolId' });
    Bill.belongsTo(models.Student, { foreignKey: 'studentId' });
    Bill.belongsTo(models.AcademicYear, { foreignKey: 'academicYearId' });
    Bill.belongsTo(models.Term, { foreignKey: 'termId' });
    Bill.belongsTo(models.User, { foreignKey: 'confirmedByUserId', as: 'confirmedBy' });
    Bill.hasMany(models.BillItem, { foreignKey: 'billId', as: 'items' });
  };

  return Bill;
};
