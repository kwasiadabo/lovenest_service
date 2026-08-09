const express = require('express');
const controller = require('./controller');
const { validateUpdateSettings } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');
const { uploadSignature, uploadLogo } = require('../../middleware/upload');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requirePermission('schoolSettings', 'MANAGE');

router.get('/school-settings', adminOnly, controller.getSettings);
router.patch('/school-settings', adminOnly, validateUpdateSettings, controller.updateSettings);
// Kept separate from the JSON PATCH above — this one is multipart (a file
// upload), so it goes through its own route + middleware rather than mixing
// body-parsing modes on one endpoint.
router.patch('/school-settings/signature', adminOnly, uploadSignature, controller.updateSignature);
router.patch('/school-settings/logo', adminOnly, uploadLogo, controller.updateLogo);

module.exports = router;
