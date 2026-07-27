const express = require('express');
const controller = require('./controller');
const {
  validateExpenseItem, validateExpenseRequest, validateExpenseApproval, validateMarkExpensePaid, validateExpenseRejection,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');
const requestRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT', 'ADMINISTRATOR');
const approveRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER');
// Both requesters and approvers need to see the list/report — the finer
// "is this your own request" distinction is enforced in the service layer,
// not by role alone.
const readRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT', 'ADMINISTRATOR', 'HEAD_TEACHER');

router.get('/expense-items', adminOnly, controller.listExpenseItems);
router.post('/expense-items', adminOnly, validateExpenseItem, controller.createExpenseItem);
router.patch('/expense-items/:id', adminOnly, validateExpenseItem, controller.updateExpenseItem);
router.delete('/expense-items/:id', adminOnly, controller.deleteExpenseItem);

router.get('/expense-requests', readRoles, controller.listExpenseRequests);
router.get('/expense-requests/report', readRoles, controller.getExpenseReport);
router.get('/expense-requests/analytics', readRoles, controller.getExpenseAnalytics);
router.post('/expense-requests', requestRoles, validateExpenseRequest, controller.createExpenseRequest);
router.patch('/expense-requests/:id', readRoles, validateExpenseRequest, controller.updateExpenseRequest);
router.delete('/expense-requests/:id', readRoles, controller.deleteExpenseRequest);
router.post('/expense-requests/:id/approve', approveRoles, validateExpenseApproval, controller.approveExpenseRequest);
router.post('/expense-requests/:id/mark-paid', approveRoles, validateMarkExpensePaid, controller.markExpenseRequestPaid);
router.post('/expense-requests/:id/reject', approveRoles, validateExpenseRejection, controller.rejectExpenseRequest);

module.exports = router;
