const express = require('express');
const controller = require('./controller');
const { validateSermon } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');
const { uploadImages } = require('../../middleware/multiImageUpload');

const router = express.Router();

router.use(authenticate, requireTenant);

// Same moduleKey as announcements/newsletters/messaging/issues — see
// announcements/routes.js.
const manageRoles = requirePermission('communications', 'MANAGE');

router.get('/sermons', manageRoles, controller.list);
router.post('/sermons', manageRoles, uploadImages, validateSermon, controller.create);
router.patch('/sermons/:id', manageRoles, uploadImages, validateSermon, controller.update);
router.delete('/sermons/:id', manageRoles, controller.remove);

module.exports = router;
