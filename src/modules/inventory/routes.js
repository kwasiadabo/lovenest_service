const express = require('express');
const controller = require('./controller');
const {
  validateInventoryItem, validateRestock, validateInventoryRequest, validateInventoryRejection,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');
const requestRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT', 'ADMINISTRATOR');
const approveRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER');
// Both requesters and approvers need to see the item list/requests — the
// finer "is this your own request" distinction is enforced in the service
// layer, not by role alone (mirrors expenses/routes.js's readRoles).
const readRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT', 'ADMINISTRATOR', 'HEAD_TEACHER');

router.get('/inventory-items', readRoles, controller.listInventoryItems);
router.post('/inventory-items', adminOnly, validateInventoryItem, controller.createInventoryItem);
router.patch('/inventory-items/:id', adminOnly, validateInventoryItem, controller.updateInventoryItem);
router.delete('/inventory-items/:id', adminOnly, controller.deleteInventoryItem);
router.post('/inventory-items/:id/restock', adminOnly, validateRestock, controller.restockInventoryItem);
router.get('/inventory-items/:id/movements', readRoles, controller.listStockMovements);
router.get('/inventory-requests/analytics', readRoles, controller.getInventoryAnalytics);

router.get('/inventory-requests', readRoles, controller.listInventoryRequests);
router.get('/inventory-requests/report', readRoles, controller.getInventoryRequestsReport);
router.post('/inventory-requests', requestRoles, validateInventoryRequest, controller.createInventoryRequest);
router.patch('/inventory-requests/:id', readRoles, validateInventoryRequest, controller.updateInventoryRequest);
router.delete('/inventory-requests/:id', readRoles, controller.deleteInventoryRequest);
router.post('/inventory-requests/:id/approve', approveRoles, controller.approveInventoryRequest);
router.post('/inventory-requests/:id/reject', approveRoles, validateInventoryRejection, controller.rejectInventoryRequest);
router.post('/inventory-requests/:id/issue', approveRoles, controller.issueInventoryRequest);

module.exports = router;
