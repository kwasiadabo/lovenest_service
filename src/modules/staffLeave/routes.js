const express = require('express');
const controller = require('./controller');
const { validateLeaveRequest, validateLeaveDecision } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Self-service — open to any authenticated school user, not gated by the
// 'staff' module permission (a teacher/driver/accountant with no other
// staff-admin access still needs to request their own leave). Scoped
// internally to the caller's own linked Staff record — see
// service.js#getOwnStaffId.
router.get('/staff/my-leave-requests', controller.listMyLeaveRequests);
router.post('/staff/my-leave-requests', validateLeaveRequest, controller.createMyLeaveRequest);

const adminOnly = requirePermission('staff', 'MANAGE');

router.get('/staff/:staffId/leave-requests', adminOnly, controller.listStaffLeaveRequests);
router.patch('/staff/leave-requests/:id', adminOnly, validateLeaveDecision, controller.updateLeaveRequestStatus);

module.exports = router;
