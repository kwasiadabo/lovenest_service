const express = require('express');
const controller = require('./controller');
const { validatePeriod, validateTimetableQuery, validateTimetableSave } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requirePermission('timetable', 'MANAGE');
const timetableRoles = requirePermission('timetable', 'CONTRIBUTE');

router.get('/timetable-periods', adminOnly, controller.listPeriods);
router.post('/timetable-periods', adminOnly, validatePeriod, controller.createPeriod);
router.patch('/timetable-periods/:id', adminOnly, validatePeriod, controller.updatePeriod);
router.delete('/timetable-periods/:id', adminOnly, controller.deletePeriod);

router.get('/timetable', timetableRoles, validateTimetableQuery, controller.getClassTimetable);
router.put('/timetable', timetableRoles, validateTimetableSave, controller.saveClassTimetable);

module.exports = router;
