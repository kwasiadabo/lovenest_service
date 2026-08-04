const express = require('express');
const controller = require('./controller');
const { validateCreateFixedAsset, validateDepreciationRun, validateDisposal } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const readRoles = requirePermission('fixedAssets', 'VIEW');
const writeRoles = requirePermission('fixedAssets', 'MANAGE');

router.get('/fixed-assets', readRoles, controller.listFixedAssets);
router.post('/fixed-assets', writeRoles, validateCreateFixedAsset, controller.createFixedAsset);
router.get('/fixed-assets/:id', readRoles, controller.getFixedAsset);
router.post('/fixed-assets/:id/dispose', writeRoles, validateDisposal, controller.disposeFixedAsset);
router.post('/fixed-assets/depreciation-runs', writeRoles, validateDepreciationRun, controller.runDepreciation);

module.exports = router;
