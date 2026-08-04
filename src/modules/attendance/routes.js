const express = require('express');
const controller = require('./controller');
const {
  validateRegisterQuery, validateRegisterSave, validateSummaryQuery, validateClassReportQuery,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const attendanceRoles = requirePermission('attendance', 'CONTRIBUTE');
// Whole-school, cross-class reporting — oversight-only, same restriction as
// assessment/routes.js#analyticsRoles.
const analyticsRoles = requirePermission('attendance', 'MANAGE');

router.get('/attendance/my-classes', attendanceRoles, controller.getMyClasses);
router.get('/attendance/register', attendanceRoles, validateRegisterQuery, controller.getRegister);
router.put('/attendance/register', attendanceRoles, validateRegisterSave, controller.saveRegister);
router.get('/attendance/summary', attendanceRoles, validateSummaryQuery, controller.getSummary);
router.get('/attendance/class-report', attendanceRoles, validateClassReportQuery, controller.getClassReport);
router.get('/attendance/analytics', analyticsRoles, controller.getAnalytics);
router.get('/attendance/my-analytics', attendanceRoles, controller.getMyAnalytics);
router.get('/attendance/my-register-status', attendanceRoles, controller.getMyRegisterStatus);
router.get('/attendance/daily-overview', analyticsRoles, controller.getDailyOverview);

module.exports = router;
