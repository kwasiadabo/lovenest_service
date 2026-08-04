const express = require('express');
const controller = require('./controller');
const { validateWeightsUpdate, validateGradeBandsUpdate, validateClassworkSourceUpdate } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Same moduleKey as academic/routes.js — grading configuration is an
// academic-setup concern in the access matrix, not its own module.
const schoolAdminOnly = requirePermission('academicSetup', 'MANAGE');

router.get('/grading-settings', controller.getGradingSettings);
router.put('/grading-settings/weights', schoolAdminOnly, validateWeightsUpdate, controller.updateWeights);
router.put('/grading-settings/grade-bands', schoolAdminOnly, validateGradeBandsUpdate, controller.updateGradeBands);
router.put('/grading-settings/classwork-source', schoolAdminOnly, validateClassworkSourceUpdate, controller.updateClassworkSource);

module.exports = router;
