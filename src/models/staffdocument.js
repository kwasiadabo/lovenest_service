const DOCUMENT_TYPES = ['CONTRACT', 'ID', 'CERTIFICATE', 'LICENSE', 'CV', 'COVER_LETTER', 'OTHER'];

module.exports = (sequelize, DataTypes) => {
  const StaffDocument = sequelize.define('StaffDocument', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
    documentType: { type: DataTypes.ENUM(...DOCUMENT_TYPES), allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    fileUrl: { type: DataTypes.STRING, allowNull: false },
    issueDate: { type: DataTypes.DATEONLY, allowNull: true },
    expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    tableName: 'staff_documents',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['schoolId', 'staffId'] },
    ],
  });

  StaffDocument.DOCUMENT_TYPES = DOCUMENT_TYPES;

  StaffDocument.associate = (models) => {
    StaffDocument.belongsTo(models.School, { foreignKey: 'schoolId' });
    StaffDocument.belongsTo(models.Staff, { foreignKey: 'staffId' });
  };

  return StaffDocument;
};
