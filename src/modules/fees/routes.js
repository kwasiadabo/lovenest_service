const express = require('express');
const controller = require('./controller');
const { validateFeeType, validateFeeAmount } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requirePermission('feesSetup', 'MANAGE');

router.get('/fee-types', adminOnly, controller.listFeeTypes);
router.post('/fee-types', adminOnly, validateFeeType, controller.createFeeType);
router.patch('/fee-types/:id', adminOnly, validateFeeType, controller.updateFeeType);
router.delete('/fee-types/:id', adminOnly, controller.deleteFeeType);

router.get('/fee-amounts', adminOnly, controller.listFeeAmounts);
router.post('/fee-amounts', adminOnly, validateFeeAmount, controller.setFeeAmount);
router.delete('/fee-amounts/:id', adminOnly, controller.deleteFeeAmount);

module.exports = router;
