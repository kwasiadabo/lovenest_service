module.exports = (sequelize, DataTypes) => {
  // Holds a self-serve registration's form data between "pay now" and
  // school creation — the school/admin user don't exist yet at payment
  // time, so this can't reuse the Payment model (schoolId there is
  // required). See onboarding/paymentService.js.
  const PendingSchoolRegistration = sequelize.define('PendingSchoolRegistration', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    reference: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    // pending | completed | failed
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    email: { type: DataTypes.STRING, allowNull: false },
    // JSON-stringified registration fields (adminPassword replaced with a
    // bcrypt hash before storage — see paymentService.js#initializeRegistrationPayment).
    payload: { type: DataTypes.TEXT, allowNull: false },
    tierCode: { type: DataTypes.STRING(30), allowNull: false },
    subscriptionAmountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    trainingAmountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    // Set once completeRegistration creates the School.
    schoolId: { type: DataTypes.UUID, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    rawResponse: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'pending_school_registrations',
  });

  return PendingSchoolRegistration;
};
