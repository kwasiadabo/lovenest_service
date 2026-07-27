const express = require('express');
const controller = require('./controller');
const { validateMessageBody, validateStatus } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const manageRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

router.get('/issues', manageRoles, controller.list);
router.get('/issues/:id', manageRoles, controller.get);
router.post('/issues/:id/messages', manageRoles, validateMessageBody, controller.addMessage);
router.patch('/issues/:id', manageRoles, validateStatus, controller.updateStatus);

module.exports = router;
