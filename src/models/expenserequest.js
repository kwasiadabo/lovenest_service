const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const PAYMENT_STATUSES = ['UNPAID', 'PAID'];
const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const ExpenseRequest = sequelize.define('ExpenseRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    expenseItemId: { type: DataTypes.UUID, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false },
    expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PENDING' },
    requestedByUserId: { type: DataTypes.UUID, allowNull: false },
    reviewedByUserId: { type: DataTypes.UUID, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    rejectionReason: { type: DataTypes.STRING(500), allowNull: true },
    // APPROVED recognizes the liability (posts Dr Expense / Cr Accounts
    // Payable); paymentStatus only flips to PAID once markExpenseRequestPaid
    // is called (posts Dr Accounts Payable / Cr Cash), which is also the
    // point the fields below get populated — approval and payment are two
    // separate events, not one (mirrors BillPayment/LevyPayment's
    // method/reference, just on this row instead of a separate payment
    // table since there's only ever one payment per approved request).
    paymentStatus: { type: DataTypes.ENUM(...PAYMENT_STATUSES), allowNull: false, defaultValue: 'UNPAID' },
    paymentMethod: { type: DataTypes.ENUM(...METHODS), allowNull: true },
    paymentReference: { type: DataTypes.STRING(100), allowNull: true },
    paidDate: { type: DataTypes.DATEONLY, allowNull: true },
    cashAccountId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'expense_requests',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['expenseItemId'] },
      { fields: ['status'] },
      { fields: ['requestedByUserId'] },
    ],
  });

  ExpenseRequest.STATUSES = STATUSES;
  ExpenseRequest.PAYMENT_STATUSES = PAYMENT_STATUSES;
  ExpenseRequest.METHODS = METHODS;

  ExpenseRequest.associate = (models) => {
    ExpenseRequest.belongsTo(models.School, { foreignKey: 'schoolId' });
    ExpenseRequest.belongsTo(models.ExpenseItem, { foreignKey: 'expenseItemId' });
    ExpenseRequest.belongsTo(models.User, { foreignKey: 'requestedByUserId', as: 'requestedBy' });
    ExpenseRequest.belongsTo(models.User, { foreignKey: 'reviewedByUserId', as: 'reviewedBy' });
    ExpenseRequest.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
  };

  return ExpenseRequest;
};
