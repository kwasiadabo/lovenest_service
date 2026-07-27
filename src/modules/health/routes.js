const express = require('express');
const controller = require('./controller');
const { validateSickBayVisit, validateMedicationLog, validateImmunization } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// ADMINISTRATOR is this app's "elevated non-teaching staff" role — the
// closest fit for a school nurse/clinic officer, who has no dedicated role
// of their own. HEAD_TEACHER gets read access for oversight, not write.
const canView = requireRole('SCHOOL_ADMIN', 'ADMINISTRATOR', 'HEAD_TEACHER');
const canRecord = requireRole('SCHOOL_ADMIN', 'ADMINISTRATOR');

router.get('/health/analytics', canView, controller.getHealthAnalytics);

router.get('/health/sick-bay-visits', canView, controller.listSickBayVisits);
router.post('/health/sick-bay-visits', canRecord, validateSickBayVisit, controller.createSickBayVisit);
router.patch('/health/sick-bay-visits/:id', canRecord, controller.updateSickBayVisit);
router.delete('/health/sick-bay-visits/:id', canRecord, controller.deleteSickBayVisit);

router.get('/health/medication-logs', canView, controller.listMedicationLogs);
router.post('/health/medication-logs', canRecord, validateMedicationLog, controller.createMedicationLog);
router.patch('/health/medication-logs/:id', canRecord, controller.updateMedicationLog);
router.delete('/health/medication-logs/:id', canRecord, controller.deleteMedicationLog);

router.get('/health/immunizations', canView, controller.listImmunizations);
router.post('/health/immunizations', canRecord, validateImmunization, controller.createImmunization);
router.patch('/health/immunizations/:id', canRecord, controller.updateImmunization);
router.delete('/health/immunizations/:id', canRecord, controller.deleteImmunization);

module.exports = router;
