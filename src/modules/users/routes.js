const express = require('express');
const controller = require('./controller');
const { validateUpdateRoles, validateStatus } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');

// No POST /users — every non-parent account is created from a Staff record
// (see staff/routes.js#create-login), and parent accounts from a Student's
// linked Parent (students/routes.js#create-login), so every account this
// list contains already has somewhere it came from.
router.get('/users', adminOnly, controller.listUsers);
router.patch('/users/:userId/status', adminOnly, validateStatus, controller.setUserStatus);
router.post('/users/:userId/reset-password', adminOnly, controller.resetUserPassword);
router.patch('/users/:userId/roles', adminOnly, validateUpdateRoles, controller.updateUserRoles);

module.exports = router;
