const TYPES = ['PAYE', 'SSNIT'];

// One row per (payrollRunId, type) — enforced by a unique index in the
// migration — recording that the school actually paid GRA/SSNIT for that
// run's PAYE or SSNIT liability. See payroll/service.js#recordStatutoryRemittance
// for why this exists as a real model rather than just a bare journal entry:
// it's what lets a second attempt at the same run+type be rejected outright.
module.exports = (sequelize, DataTypes) => {
  const StatutoryRemittance = sequelize.define('StatutoryRemittance', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    payrollRunId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM(...TYPES), allowNull: false },
    amountPesewas: { type: DataTypes.INTEGER, allowNull: false },
    remittanceDate: { type: DataTypes.DATEONLY, allowNull: false },
    cashAccountId: { type: DataTypes.UUID, allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    journalEntryId: { type: DataTypes.UUID, allowNull: false },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'statutory_remittances',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['payrollRunId'] },
    ],
  });

  StatutoryRemittance.TYPES = TYPES;

  StatutoryRemittance.associate = (models) => {
    StatutoryRemittance.belongsTo(models.School, { foreignKey: 'schoolId' });
    StatutoryRemittance.belongsTo(models.PayrollRun, { foreignKey: 'payrollRunId' });
    StatutoryRemittance.belongsTo(models.CashAccount, { foreignKey: 'cashAccountId', as: 'cashAccount' });
    StatutoryRemittance.belongsTo(models.JournalEntry, { foreignKey: 'journalEntryId', as: 'journalEntry' });
    StatutoryRemittance.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
  };

  return StatutoryRemittance;
};
