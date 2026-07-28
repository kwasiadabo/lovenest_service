const express = require('express');
const controller = require('./controller');
const { validateStaffAppraisal } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/staff/:staffId/appraisals', adminOnly, controller.listStaffAppraisals);
router.post('/staff/:staffId/appraisals', adminOnly, validateStaffAppraisal, controller.createStaffAppraisal);
router.delete('/staff/:staffId/appraisals/:appraisalId', adminOnly, controller.deleteStaffAppraisal);

module.exports = router;
