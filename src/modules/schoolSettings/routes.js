const express = require('express');
const controller = require('./controller');
const { validateUpdateSettings } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/school-settings', adminOnly, controller.getSettings);
router.patch('/school-settings', adminOnly, validateUpdateSettings, controller.updateSettings);

module.exports = router;
