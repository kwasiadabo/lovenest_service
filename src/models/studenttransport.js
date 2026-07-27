// PENDING_PAYMENT: subscribed but their confirming invoice (auto-created by
// assignStudentTransport) isn't fully paid yet — excluded from every
// "ENROLLED"-filtered read (roster, pickup alerts, vehicle capacity), so an
// unpaid subscription neither rides nor holds a seat. Flips to ENROLLED by
// transport/service.js#tryConfirmSubscription once that invoice is settled.
const STATUSES = ['PENDING_PAYMENT', 'ENROLLED', 'WITHDRAWN'];
const BILLING_CYCLES = ['TERMLY', 'MONTHLY'];

module.exports = (sequelize, DataTypes) => {
  const StudentTransport = sequelize.define('StudentTransport', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    schoolId: { type: DataTypes.UUID, allowNull: false },
    studentId: { type: DataTypes.UUID, allowNull: false },
    vehicleId: { type: DataTypes.UUID, allowNull: false },
    // Which stop this student boards at — optional, since a school may run
    // transport without recording per-student pickup points at all.
    pickupPointId: { type: DataTypes.UUID, allowNull: true },
    // STRING rather than ENUM — SQL Server implements ENUM as a NVARCHAR plus
    // an auto-named CHECK constraint that migrations must drop before adding
    // a value (see 20260101000033-add-arrears-bill-items.js), so a status set
    // that's expected to grow again is kept as a plain validated string.
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING_PAYMENT' },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    // Chosen per subscription, not per school — this row IS the transport
    // subscription; generateTransportInvoices (transport/service.js) reads
    // this to decide which cadence to bill the student on.
    billingCycle: {
      type: DataTypes.ENUM(...BILLING_CYCLES), allowNull: false, defaultValue: 'TERMLY',
    },
  }, {
    tableName: 'student_transport',
    indexes: [
      { fields: ['schoolId'] },
      { fields: ['vehicleId'] },
      { unique: true, fields: ['schoolId', 'studentId'] },
    ],
  });

  StudentTransport.STATUSES = STATUSES;
  StudentTransport.BILLING_CYCLES = BILLING_CYCLES;

  StudentTransport.associate = (models) => {
    StudentTransport.belongsTo(models.School, { foreignKey: 'schoolId' });
    StudentTransport.belongsTo(models.Student, { foreignKey: 'studentId' });
    StudentTransport.belongsTo(models.Vehicle, { foreignKey: 'vehicleId' });
    StudentTransport.belongsTo(models.PickupPoint, { foreignKey: 'pickupPointId' });
    StudentTransport.hasMany(models.TransportInvoice, { foreignKey: 'studentTransportId', as: 'invoices' });
  };

  return StudentTransport;
};
