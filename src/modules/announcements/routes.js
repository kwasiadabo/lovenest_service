const express = require('express');
const controller = require('./controller');
const { validateAnnouncement } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');
const { uploadImages } = require('../../middleware/multiImageUpload');

const router = express.Router();

router.use(authenticate, requireTenant);

// Same moduleKey as messaging/newsletters/issues (grouped as "Communications"
// in the access matrix, matching the frontend's Messaging nav group).
const manageRoles = requirePermission('communications', 'MANAGE');

router.get('/announcements', manageRoles, controller.list);
// uploadImages must run before validateAnnouncement — it's what parses the
// multipart body into req.body/req.files in the first place.
router.post('/announcements', manageRoles, uploadImages, validateAnnouncement, controller.create);
router.patch('/announcements/:id', manageRoles, uploadImages, validateAnnouncement, controller.update);
router.delete('/announcements/:id', manageRoles, controller.remove);

module.exports = router;
