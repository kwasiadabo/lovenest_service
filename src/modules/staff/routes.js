const express = require('express');
const controller = require('./controller');
const {
  validateStaff, validateStaffSeparation, validateCreateLogin, validateLinkExistingUser,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/staff', adminOnly, controller.listStaff);
router.post('/staff', adminOnly, validateStaff, controller.createStaffMember);
router.patch('/staff/:staffId', adminOnly, controller.updateStaffMember);
router.delete('/staff/:staffId', adminOnly, controller.deleteStaffMember);
router.patch('/staff/:staffId/separate', adminOnly, validateStaffSeparation, controller.separateStaffMember);
router.post('/staff/:staffId/reactivate', adminOnly, controller.reactivateStaffMember);

router.get('/staff/unlinked-users', adminOnly, controller.listUnlinkedUsers);
router.post('/staff/:staffId/create-login', adminOnly, validateCreateLogin, controller.createLogin);
router.post('/staff/:staffId/reset-login-password', adminOnly, controller.resetLoginPassword);
router.post('/staff/:staffId/link-user', adminOnly, validateLinkExistingUser, controller.linkExistingUser);

router.get('/staff/attrition-analytics', adminOnly, controller.getAttritionAnalytics);

module.exports = router;
