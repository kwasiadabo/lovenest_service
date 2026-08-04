const express = require('express');
const controller = require('./controller');
const { validateNewsletter } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Same moduleKey as messaging/announcements/issues — see announcements/routes.js.
const manageRoles = requirePermission('communications', 'MANAGE');

router.get('/newsletters', manageRoles, controller.list);
router.post('/newsletters', manageRoles, validateNewsletter, controller.create);
router.patch('/newsletters/:id', manageRoles, validateNewsletter, controller.update);
router.delete('/newsletters/:id', manageRoles, controller.remove);

module.exports = router;
