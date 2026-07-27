// Platform-level, deliberately NOT schoolId-scoped — SSNIT contribution
// rates are national, not per-school. A rate change is a new row with a
// fresh effectiveFrom date (see modules/platform), never an edit to an
// existing one — old payroll runs keep using whichever rate was active
// when they ran (see utils/ghanaPaye.js#getSsnitRates).
module.exports = (sequelize, DataTypes) => {
  const SsnitRate = sequelize.define('SsnitRate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    employeeRatePercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    employerRatePercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
  }, {
    tableName: 'ssnit_rates',
    indexes: [
      { fields: ['effectiveFrom'] },
    ],
  });

  return SsnitRate;
};
