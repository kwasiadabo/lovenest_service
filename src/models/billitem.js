const SOURCES = ['STANDARD', 'SPECIAL', 'ARREARS', 'DISCOUNT', 'INDIVIDUAL_DISCOUNT'];

module.exports = (sequelize, DataTypes) => {
  const BillItem = sequelize.define('BillItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    billId: { type: DataTypes.UUID, allowNull: false },
    // Null for ARREARS, DISCOUNT, and INDIVIDUAL_DISCOUNT items — a prior
    // balance forward and a sibling/individual discount reduction aren't
    // configured fees. amountPesewas is negative for the two discount
    // sources, reducing the bill total on sum. A bill carries at most one of
    // DISCOUNT/INDIVIDUAL_DISCOUNT at a time — the individual discount
    // overrides the sibling one, never stacks with it (see
    // financials/service.js#syncStudentDiscount).
    feeTypeId: { type: DataTypes.UUID, allowNull: true },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'STANDARD' },
  }, {
    tableName: 'bill_items',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['billId'] },
      { fields: ['feeTypeId'] },
    ],
  });

  BillItem.SOURCES = SOURCES;

  BillItem.associate = (models) => {
    BillItem.belongsTo(models.School, { foreignKey: 'schoolId' });
    BillItem.belongsTo(models.Bill, { foreignKey: 'billId' });
    BillItem.belongsTo(models.FeeType, { foreignKey: 'feeTypeId' });
  };

  return BillItem;
};
