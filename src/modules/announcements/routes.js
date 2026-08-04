const express = require('express');
const controller = require('./controller');
const { validateAnnouncement } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Same moduleKey as messaging/newsletters/issues (grouped as "Communications"
// in the access matrix, matching the frontend's Messaging nav group).
const manageRoles = requirePermission('communications', 'MANAGE');

router.get('/announcements', manageRoles, controller.list);
router.post('/announcements', manageRoles, validateAnnouncement, controller.create);
router.patch('/announcements/:id', manageRoles, validateAnnouncement, controller.update);
router.delete('/announcements/:id', manageRoles, controller.remove);

module.exports = router;
