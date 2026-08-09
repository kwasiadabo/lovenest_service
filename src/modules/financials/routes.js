const express = require('express');
const controller = require('./controller');
const {
  validateGenerateBills, validatePreviewBills, validateSpecialItem, validatePayment, validatePaymentUpdate,
  validateConfirmBatch, validateSendReminders,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const billingRoles = requirePermission('billing', 'CONTRIBUTE');
// Reversing an already-posted payment is a narrower privilege than the
// billingRoles actions above — same role set as transport/levies' reversal
// routes. assertNotSelfReversal (service layer) additionally blocks
// whoever recorded the payment from being the one to reverse it.
const reversalRoles = requirePermission('billing', 'MANAGE');

router.post('/bills/generate', billingRoles, validateGenerateBills, controller.generateBills);
// A dry run of the same payload as /bills/generate — POST (not GET) because
// targetIds/feeTypeIds are arrays, same reasoning as generate itself.
router.post('/bills/preview', billingRoles, validatePreviewBills, controller.previewBillGeneration);
router.get('/bills/analytics', billingRoles, controller.getBillAnalytics);
router.get('/bills', billingRoles, controller.listBills);
router.post('/bills/confirm-batch', billingRoles, validateConfirmBatch, controller.confirmBills);
router.post('/bills/email', billingRoles, validateConfirmBatch, controller.emailBills);
router.post('/bills/:id/confirm', billingRoles, controller.confirmBill);
router.post('/bills/:id/items', billingRoles, validateSpecialItem, controller.addSpecialItem);
router.delete('/bill-items/:id', billingRoles, controller.removeBillItem);

router.get('/students/:studentId/ledger', billingRoles, controller.getStudentLedger);
router.get('/students/:studentId/financial-statement', billingRoles, controller.getStudentFinancialStatement);
router.post('/students/:studentId/bill-payments', billingRoles, validatePayment, controller.recordPayment);
router.get('/bill-payments/analytics', billingRoles, controller.getPaymentAnalytics);
router.get('/bill-payments', billingRoles, controller.listPayments);
router.patch('/bill-payments/:id', billingRoles, validatePaymentUpdate, controller.updatePayment);
router.delete('/bill-payments/:id', reversalRoles, controller.deletePayment);
router.get('/bill-payments/:id/receipt', billingRoles, controller.getReceipt);
router.get('/bill-payments/:id/revisions', billingRoles, controller.getPaymentRevisions);

router.get('/debtors', billingRoles, controller.getDebtors);
router.post('/debtors/send-reminders', billingRoles, validateSendReminders, controller.sendDebtReminders);

module.exports = router;
