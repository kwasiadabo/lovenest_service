const transportService = require('./service');
const { buildReceiptPdf } = require('../../utils/receiptPdf');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listVehicles = wrap(async (req, res) => {
  res.json(await transportService.listVehicles(req.schoolId));
});

const createVehicle = wrap(async (req, res) => {
  res.status(201).json(await transportService.createVehicle(req.schoolId, req.body));
});

const updateVehicle = wrap(async (req, res) => {
  res.json(await transportService.updateVehicle(req.schoolId, req.params.id, req.body));
});

const deleteVehicle = wrap(async (req, res) => {
  await transportService.deleteVehicle(req.schoolId, req.params.id);
  res.status(204).send();
});

const listRoutes = wrap(async (req, res) => {
  res.json(await transportService.listRoutes(req.schoolId, { vehicleId: req.query.vehicleId }));
});

const createRoute = wrap(async (req, res) => {
  res.status(201).json(await transportService.createRoute(req.schoolId, req.body));
});

const updateRoute = wrap(async (req, res) => {
  res.json(await transportService.updateRoute(req.schoolId, req.params.id, req.body));
});

const deleteRoute = wrap(async (req, res) => {
  await transportService.deleteRoute(req.schoolId, req.params.id);
  res.status(204).send();
});

const createPickupPoint = wrap(async (req, res) => {
  res.status(201).json(await transportService.createPickupPoint(req.schoolId, req.body));
});

const updatePickupPoint = wrap(async (req, res) => {
  res.json(await transportService.updatePickupPoint(req.schoolId, req.params.id, req.body));
});

const deletePickupPoint = wrap(async (req, res) => {
  await transportService.deletePickupPoint(req.schoolId, req.params.id);
  res.status(204).send();
});

const listStudentTransport = wrap(async (req, res) => {
  const { vehicleId, status } = req.query;
  res.json(await transportService.listStudentTransport(req.schoolId, { vehicleId, status }));
});

const assignStudentTransport = wrap(async (req, res) => {
  res.status(201).json(await transportService.assignStudentTransport(req.schoolId, req.auth.userId, req.body));
});

const withdrawStudentTransport = wrap(async (req, res) => {
  res.json(await transportService.withdrawStudentTransport(req.schoolId, req.params.id));
});

const deleteStudentTransport = wrap(async (req, res) => {
  await transportService.deleteStudentTransport(req.schoolId, req.params.id, req.auth.userId);
  res.status(204).send();
});

const sendPickupAlert = wrap(async (req, res) => {
  res.json(await transportService.sendPickupAlert(req.schoolId, req.params.id));
});

const getPickupRecord = wrap(async (req, res) => {
  const { vehicleId, date } = req.query;
  res.json(await transportService.getPickupRecord(req.schoolId, { vehicleId, date }));
});

const savePickupRecord = wrap(async (req, res) => {
  const { vehicleId, date, records } = req.body;
  res.json(await transportService.savePickupRecord(req.schoolId, req.auth.userId, { vehicleId, date, records }));
});

const getStudentPickupHistory = wrap(async (req, res) => {
  const { studentId, from, to } = req.query;
  res.json(await transportService.getStudentPickupHistory(req.schoolId, studentId, { from, to }));
});

const getDropoffRecord = wrap(async (req, res) => {
  const { vehicleId, date } = req.query;
  res.json(await transportService.getDropoffRecord(req.schoolId, { vehicleId, date }));
});

const recordStudentDropoff = wrap(async (req, res) => {
  const {
    studentId, vehicleId, latitude, longitude, notes,
  } = req.body;
  res.status(201).json(await transportService.recordStudentDropoff(req.schoolId, req.auth.userId, {
    studentId, vehicleId, latitude, longitude, notes,
  }));
});

const getStudentDropoffHistory = wrap(async (req, res) => {
  const { studentId, from, to } = req.query;
  res.json(await transportService.getStudentDropoffHistory(req.schoolId, studentId, { from, to }));
});

const getPickupReport = wrap(async (req, res) => {
  const {
    vehicleId, driverStaffId, academicYearId, termId, from, to,
  } = req.query;
  res.json(await transportService.getPickupReport(req.schoolId, {
    vehicleId, driverStaffId, academicYearId, termId, from, to,
  }));
});

const getDropoffReport = wrap(async (req, res) => {
  const {
    vehicleId, driverStaffId, academicYearId, termId, from, to,
  } = req.query;
  res.json(await transportService.getDropoffReport(req.schoolId, {
    vehicleId, driverStaffId, academicYearId, termId, from, to,
  }));
});

const getDropoffAnalytics = wrap(async (req, res) => {
  const { vehicleId, from, to } = req.query;
  res.json(await transportService.getDropoffAnalytics(req.schoolId, { vehicleId, from, to }));
});

const previewTransportInvoices = wrap(async (req, res) => {
  const {
    billingCycle, termId, month, year,
  } = req.query;
  res.json(await transportService.previewTransportInvoices(req.schoolId, {
    billingCycle, termId, month, year,
  }));
});

const generateTransportInvoices = wrap(async (req, res) => {
  res.status(201).json(await transportService.generateTransportInvoices(req.schoolId, req.auth.userId, req.body));
});

const listTransportInvoices = wrap(async (req, res) => {
  const {
    studentId, vehicleId, billingCycle, status,
  } = req.query;
  res.json(await transportService.listTransportInvoices(req.schoolId, {
    studentId, vehicleId, billingCycle, status,
  }));
});

const deleteTransportInvoice = wrap(async (req, res) => {
  await transportService.deleteTransportInvoice(req.schoolId, req.params.id, req.auth.userId);
  res.status(204).send();
});

const getTransportBillingReport = wrap(async (req, res) => {
  const {
    billingCycle, termId, month, year, vehicleId, academicYearId,
  } = req.query;
  res.json(await transportService.getTransportBillingReport(req.schoolId, {
    billingCycle, termId, month, year, vehicleId, academicYearId,
  }));
});

const recordTransportPayment = wrap(async (req, res) => {
  res.status(201).json(await transportService.recordTransportPayment(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const updateTransportPayment = wrap(async (req, res) => {
  res.json(await transportService.updateTransportPayment(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const deleteTransportPayment = wrap(async (req, res) => {
  await transportService.deleteTransportPayment(req.schoolId, req.params.id, req.auth.userId);
  res.status(204).send();
});

const getTransportPaymentReceipt = wrap(async (req, res) => {
  const data = await transportService.getTransportPaymentReceiptData(req.schoolId, req.params.id);
  const pdfBuffer = await buildReceiptPdf(data);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="receipt-${data.payment.receiptNumber}.pdf"`,
  });
  res.send(pdfBuffer);
});

const getTransportPaymentRevisions = wrap(async (req, res) => {
  res.json(await transportService.getTransportPaymentRevisions(req.schoolId, req.params.id));
});

const listTransportPayments = wrap(async (req, res) => {
  const { invoiceId, studentId } = req.query;
  res.json(await transportService.listTransportPayments(req.schoolId, { invoiceId, studentId }));
});

const getTransportDebtors = wrap(async (req, res) => {
  res.json(await transportService.getTransportDebtors(req.schoolId, { vehicleId: req.query.vehicleId }));
});

const getStudentTransportStatement = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await transportService.getStudentTransportStatement(req.schoolId, req.params.studentId, { from, to }));
});

module.exports = {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  listRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  createPickupPoint,
  updatePickupPoint,
  deletePickupPoint,
  listStudentTransport,
  assignStudentTransport,
  withdrawStudentTransport,
  deleteStudentTransport,
  sendPickupAlert,
  getPickupRecord,
  savePickupRecord,
  getStudentPickupHistory,
  getPickupReport,
  previewTransportInvoices,
  generateTransportInvoices,
  listTransportInvoices,
  deleteTransportInvoice,
  getTransportBillingReport,
  recordTransportPayment,
  updateTransportPayment,
  deleteTransportPayment,
  getTransportPaymentReceipt,
  getTransportPaymentRevisions,
  listTransportPayments,
  getTransportDebtors,
  getStudentTransportStatement,
  getDropoffRecord,
  recordStudentDropoff,
  getStudentDropoffHistory,
  getDropoffReport,
  getDropoffAnalytics,
};
