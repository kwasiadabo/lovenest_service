const TYPES = ['STUDENTS', 'FEE_BALANCES', 'TRANSPORT_SUBSCRIBERS'];
const STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED'];

module.exports = (sequelize, DataTypes) => {
  const ImportBatch = sequelize.define('ImportBatch', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM(...TYPES), allowNull: false },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PENDING' },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    totalRows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    validRowCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    errorRowCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // JSON-serialized array of { rowNumber, data, errors[], outcome? } — the
    // full parsed-and-validated row set from preview, replayed on confirm so
    // a row can't be tampered with between the two steps and the file never
    // needs re-uploading. TEXT rather than DataTypes.JSON, matching this
    // app's existing convention for serialized blobs (see Payslip.breakdownJson).
    rowsJson: { type: DataTypes.TEXT, allowNull: false },
    createdByUserId: { type: DataTypes.UUID, allowNull: true },
    confirmedByUserId: { type: DataTypes.UUID, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'import_batches',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'type'] },
    ],
  });

  ImportBatch.TYPES = TYPES;
  ImportBatch.STATUSES = STATUSES;

  ImportBatch.associate = (models) => {
    ImportBatch.belongsTo(models.School, { foreignKey: 'schoolId' });
    ImportBatch.belongsTo(models.User, { foreignKey: 'createdByUserId', as: 'createdBy' });
    ImportBatch.belongsTo(models.User, { foreignKey: 'confirmedByUserId', as: 'confirmedBy' });
  };

  return ImportBatch;
};
