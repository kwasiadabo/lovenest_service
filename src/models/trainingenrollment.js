// One mandatory 3-day onboarding training per school (max 15 attendees,
// in-person or online) — created once at provisioning time (see
// platform/service.js#provisionSchool, onboarding/service.js#registerSchool)
// and paid for via the same Paystack pipeline as subscriptions (see
// billing/service.js#initializeTrainingPayment). Schools provisioned before
// this feature existed simply have no row here — see
// app/RequireActiveSchool.jsx, which only gates on an explicit 'pending'
// paymentStatus, never on the row's absence.
module.exports = (sequelize, DataTypes) => {
  const TrainingEnrollment = sequelize.define('TrainingEnrollment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false, unique: true },
    mode: { type: DataTypes.STRING(20), allowNull: false },
    attendeeCount: { type: DataTypes.INTEGER, allowNull: false },
    // Snapshotted from config/training.js#TRAINING_COSTS_PESEWAS at creation.
    costPesewas: { type: DataTypes.INTEGER, allowNull: false },
    paymentStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    paidAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'training_enrollments',
  });

  TrainingEnrollment.associate = (models) => {
    TrainingEnrollment.belongsTo(models.School, { foreignKey: 'schoolId' });
  };

  return TrainingEnrollment;
};
