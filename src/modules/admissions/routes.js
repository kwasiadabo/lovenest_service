const express = require('express');
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requirePermission('students', 'MANAGE');

router.get('/admissions/applicants', adminOnly, controller.listApplicants);
router.patch('/admissions/applicants/:id/shortlist', adminOnly, controller.shortlistApplicant);
router.patch('/admissions/applicants/:id/reject', adminOnly, controller.rejectApplicant);
router.patch('/admissions/applicants/:id/accept', adminOnly, controller.acceptApplicant);

module.exports = router;
