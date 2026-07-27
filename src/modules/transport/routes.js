const express = require('express');
const controller = require('./controller');
const {
  validateVehicle, validateRoute, validatePickupPoint, validateStudentTransportAssign,
  validatePickupRecordQuery, validatePickupRecordSave, validateStudentPickupHistoryQuery,
  validateDropoffRecordQuery, validateRecordDropoff, validateStudentDropoffHistoryQuery,
  validateGenerateTransportInvoices, validatePreviewTransportInvoices, validateTransportPayment,
  validateTransportPaymentUpdate,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');
// Recording a drop-off happens live, in the field, by whoever's riding the
// bus that day — not necessarily a SCHOOL_ADMIN. Same role set as
// attendance's register-taking guard.
const dropoffRecordingRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER');
// Reversing an already-posted invoice/payment is a narrower privilege than
// the adminOnly actions above — same role set as financials/levies'
// reversal routes. assertNotSelfReversal (service layer) additionally
// blocks whoever recorded the transaction from being the one to reverse it.
const reversalRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT');

router.get('/vehicles', adminOnly, controller.listVehicles);
router.post('/vehicles', adminOnly, validateVehicle, controller.createVehicle);
router.patch('/vehicles/:id', adminOnly, validateVehicle, controller.updateVehicle);
router.delete('/vehicles/:id', adminOnly, controller.deleteVehicle);
router.post('/vehicles/:id/send-pickup-alert', adminOnly, controller.sendPickupAlert);

router.get('/transport-routes', adminOnly, controller.listRoutes);
router.post('/transport-routes', adminOnly, validateRoute, controller.createRoute);
router.patch('/transport-routes/:id', adminOnly, validateRoute, controller.updateRoute);
router.delete('/transport-routes/:id', adminOnly, controller.deleteRoute);

router.post('/pickup-points', adminOnly, validatePickupPoint, controller.createPickupPoint);
router.patch('/pickup-points/:id', adminOnly, validatePickupPoint, controller.updatePickupPoint);
router.delete('/pickup-points/:id', adminOnly, controller.deletePickupPoint);

router.get('/student-transport', adminOnly, controller.listStudentTransport);
router.post('/student-transport', adminOnly, validateStudentTransportAssign, controller.assignStudentTransport);
router.post('/student-transport/:id/withdraw', adminOnly, controller.withdrawStudentTransport);
router.delete('/student-transport/:id', adminOnly, controller.deleteStudentTransport);

router.get('/pickup-records', adminOnly, validatePickupRecordQuery, controller.getPickupRecord);
router.put('/pickup-records', adminOnly, validatePickupRecordSave, controller.savePickupRecord);
router.get('/pickup-history', adminOnly, validateStudentPickupHistoryQuery, controller.getStudentPickupHistory);
router.get('/pickup-report', adminOnly, controller.getPickupReport);

router.get('/dropoff-records', dropoffRecordingRoles, validateDropoffRecordQuery, controller.getDropoffRecord);
router.post('/dropoff-records', dropoffRecordingRoles, validateRecordDropoff, controller.recordStudentDropoff);
router.get('/dropoff-history', adminOnly, validateStudentDropoffHistoryQuery, controller.getStudentDropoffHistory);
router.get('/dropoff-report', adminOnly, controller.getDropoffReport);
router.get('/dropoff-analytics', adminOnly, controller.getDropoffAnalytics);

router.get('/transport-invoices/preview', adminOnly, validatePreviewTransportInvoices, controller.previewTransportInvoices);
router.post('/transport-invoices/generate', adminOnly, validateGenerateTransportInvoices, controller.generateTransportInvoices);
router.get('/transport-invoices', adminOnly, controller.listTransportInvoices);
router.delete('/transport-invoices/:id', reversalRoles, controller.deleteTransportInvoice);
router.post('/transport-invoices/:id/payments', adminOnly, validateTransportPayment, controller.recordTransportPayment);

router.get('/transport-payments', adminOnly, controller.listTransportPayments);
router.patch('/transport-payments/:id', adminOnly, validateTransportPaymentUpdate, controller.updateTransportPayment);
router.delete('/transport-payments/:id', reversalRoles, controller.deleteTransportPayment);
router.get('/transport-payments/:id/receipt', adminOnly, controller.getTransportPaymentReceipt);
router.get('/transport-payments/:id/revisions', adminOnly, controller.getTransportPaymentRevisions);

router.get('/transport-billing-report', adminOnly, controller.getTransportBillingReport);
router.get('/transport-debtors', adminOnly, controller.getTransportDebtors);
router.get('/students/:studentId/transport-statement', adminOnly, controller.getStudentTransportStatement);

module.exports = router;
