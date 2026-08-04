const express = require('express');
const controller = require('./controller');
const { validateCreatePaymentAccount } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Billing staff need to read these to preview/print confirmed bills, but
// only school admins (schoolSettings MANAGE, same gate as SchoolSettingsPage)
// configure them.
const readRoles = requirePermission('billing', 'VIEW');
const adminOnly = requirePermission('schoolSettings', 'MANAGE');

router.get('/payment-accounts', readRoles, controller.listPaymentAccounts);
router.post('/payment-accounts', adminOnly, validateCreatePaymentAccount, controller.createPaymentAccount);
router.patch('/payment-accounts/:id', adminOnly, controller.updatePaymentAccount);

module.exports = router;
