const KINDS = ['BANK', 'MOBILE_MONEY'];

module.exports = (sequelize, DataTypes) => {
  const PaymentAccount = sequelize.define('PaymentAccount', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false }, // e.g. "GCB Main Account", "MTN MoMo - Bursar"
    kind: { type: DataTypes.ENUM(...KINDS), allowNull: false },
    bankName: { type: DataTypes.STRING(100), allowNull: true }, // bank name, or mobile money network (MTN/Vodafone/AirtelTigo)
    accountNumber: { type: DataTypes.STRING(50), allowNull: false },
    accountName: { type: DataTypes.STRING(150), allowNull: true }, // name the account/wallet is held in, if different from the school name
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'payment_accounts',
    indexes: [
      { fields: ['schoolId'] },
    ],
  });

  PaymentAccount.KINDS = KINDS;

  PaymentAccount.associate = (models) => {
    PaymentAccount.belongsTo(models.School, { foreignKey: 'schoolId' });
  };

  return PaymentAccount;
};
