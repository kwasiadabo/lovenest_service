// Platform-level, deliberately NOT schoolId-scoped — Ghana Revenue
// Authority PAYE bands are national, not per-school. A rate change ships
// as a new seeder row (see seeders/), never a code or per-tenant change.
module.exports = (sequelize, DataTypes) => {
  const PayeTaxBand = sequelize.define('PayeTaxBand', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    bandOrder: { type: DataTypes.INTEGER, allowNull: false },
    // Null = no upper bound (the top band).
    upToPesewas: { type: DataTypes.BIGINT, allowNull: true },
    ratePercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
  }, {
    tableName: 'paye_tax_bands',
    indexes: [
      { fields: ['effectiveFrom'] },
    ],
  });

  return PayeTaxBand;
};
