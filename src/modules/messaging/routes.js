const express = require('express');
const controller = require('./controller');
const { validateComposeSend } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Same moduleKey as announcements/newsletters/issues — the frontend nav
// groups all four under one "Messaging" section, so the matrix does too.
const messagingRoles = requirePermission('communications', 'MANAGE');

router.get('/messaging/recipients/parents', messagingRoles, controller.previewParentRecipients);
router.get('/messaging/recipients/teachers', messagingRoles, controller.previewTeacherRecipients);
router.post('/messaging/send', messagingRoles, validateComposeSend, controller.composeSend);
router.get('/messaging/batches', messagingRoles, controller.listBatches);
router.get('/messaging/batches/:id', messagingRoles, controller.getBatch);

module.exports = router;
