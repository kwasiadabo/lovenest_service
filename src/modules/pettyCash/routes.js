const express = require('express');
const controller = require('./controller');
const {
  validateSetUpFund, validateUpdateFund, validateTopUp, validateDisbursement, validateReplenishment, validateVoid,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Mirrors accounting/routes.js's tiering: viewing is open to the usual
// finance roles, but setting up the fund/voiding a voucher/replenishing —
// anything that touches a real cash account balance — is SCHOOL_ADMIN only.
const readRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT', 'HEAD_TEACHER');
const custodianRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT', 'ADMINISTRATOR');
const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/petty-cash/fund', readRoles, controller.getFund);
router.post('/petty-cash/fund', adminOnly, validateSetUpFund, controller.setUpFund);
router.patch('/petty-cash/fund/:id', adminOnly, validateUpdateFund, controller.updateFund);
router.post('/petty-cash/fund/top-up', adminOnly, validateTopUp, controller.topUpFund);

router.get('/petty-cash/vouchers', readRoles, controller.listVouchers);
router.post('/petty-cash/vouchers', custodianRoles, validateDisbursement, controller.recordDisbursement);
router.post('/petty-cash/vouchers/:id/void', adminOnly, validateVoid, controller.voidVoucher);

router.get('/petty-cash/replenishments', readRoles, controller.listReplenishments);
router.post('/petty-cash/replenishments', adminOnly, validateReplenishment, controller.recordReplenishment);

module.exports = router;
