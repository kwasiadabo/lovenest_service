const express = require('express');
const controller = require('./controller');
const {
  validateProvisionSchool, validateUpdateSchool, validateSetStatus, validateTenantActionNote, validateSsnitRate, validatePayeTaxBands,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requirePlatform } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');
const { uploadLogo } = require('../../middleware/upload');

const router = express.Router();

// Every route here is cross-tenant by design — restricted to SuperAdmin
// tokens (schoolId === null) via requirePlatform, never exposed to
// school-scoped routes. See plan §1 and §4.
router.use(authenticate, requirePlatform, requireRole('SUPER_ADMIN'));

router.post('/schools', uploadLogo, validateProvisionSchool, controller.provisionSchool);
router.get('/schools', controller.listSchools);
router.get('/schools/:schoolId', controller.getTenantDetail);
router.patch('/schools/:schoolId', uploadLogo, validateUpdateSchool, controller.updateSchool);
router.patch('/schools/:schoolId/status', validateSetStatus, controller.setSchoolStatus);
router.patch('/schools/:schoolId/population', controller.updateStudentPopulation);

router.post('/schools/:schoolId/block', validateTenantActionNote, controller.blockSchool);
router.post('/schools/:schoolId/suspend', validateTenantActionNote, controller.suspendSchool);
router.post('/schools/:schoolId/deactivate', validateTenantActionNote, controller.deactivateSchool);
router.post('/schools/:schoolId/reactivate', validateTenantActionNote, controller.reactivateSchool);

router.get('/analytics/revenue', controller.getRevenueAnalytics);
router.get('/analytics/tenant-health', controller.getTenantHealthAnalytics);
router.get('/analytics/usage', controller.getUsageAnalytics);

router.post('/reminders/run-now', controller.runReminderSweepNow);
router.post('/monthly-billing/run-now', controller.runMonthlyBillingSweepNow);

router.get('/statutory-settings', controller.getStatutorySettings);
router.post('/statutory-settings/ssnit-rate', validateSsnitRate, controller.setSsnitRate);
router.post('/statutory-settings/paye-tax-bands', validatePayeTaxBands, controller.setPayeTaxBands);

module.exports = router;
