const express = require('express');
const controller = require('./controller');
const {
  validateVerifyScan, validateCheckIn, validateCheckOut, validateAuthorizedPickupPerson, validateGateLogSettingsUpdate,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// VIEW covers read-only oversight (HEAD_TEACHER's default level) — CONTRIBUTE
// is required to actually check a student in/out, MANAGE to edit the
// authorized-persons list or the dismissal-time setting. ADMINISTRATOR
// (front desk) defaults to MANAGE, so all three are satisfied for them.
const gateLogView = requirePermission('gateLog', 'VIEW');
const gateLogContribute = requirePermission('gateLog', 'CONTRIBUTE');
const gateLogManage = requirePermission('gateLog', 'MANAGE');

router.get('/gate-log/today', gateLogView, controller.getToday);
router.post('/gate-log/verify-scan', gateLogView, validateVerifyScan, controller.verifyScan);
router.post('/gate-log/check-in', gateLogContribute, validateCheckIn, controller.checkIn);
router.post('/gate-log/check-out', gateLogContribute, validateCheckOut, controller.checkOut);
router.get('/gate-log/students/:studentId/authorized-pickup-persons', gateLogView, controller.getAuthorizedPickupPersons);
router.post(
  '/gate-log/students/:studentId/authorized-pickup-persons',
  gateLogManage,
  validateAuthorizedPickupPerson,
  controller.addAuthorizedPickupPerson,
);
router.patch('/gate-log/authorized-pickup-persons/:id', gateLogManage, controller.updateAuthorizedPickupPerson);
router.get('/gate-log/daily-report', gateLogView, controller.getDailyReport);
router.get('/gate-log/settings', gateLogView, controller.getGateLogSettings);
router.patch('/gate-log/settings', gateLogManage, validateGateLogSettingsUpdate, controller.updateGateLogSettings);

module.exports = router;
