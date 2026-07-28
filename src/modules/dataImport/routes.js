const express = require('express');
const controller = require('./controller');
const { validateImportType, validateFilePresent } = require('./validators');
const { uploadImportFile } = require('../../middleware/importUpload');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Onboarding-scale bulk import is an admin task, same gating as creating
// students/vehicles directly.
const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/imports/:type/template', adminOnly, validateImportType, controller.getTemplate);
router.post('/imports/:type/preview', adminOnly, validateImportType, uploadImportFile, validateFilePresent, controller.preview);
router.get('/imports', adminOnly, controller.list);
router.get('/imports/:id', adminOnly, controller.getDetail);
router.post('/imports/:id/confirm', adminOnly, controller.confirm);
router.delete('/imports/:id', adminOnly, controller.cancel);

module.exports = router;
