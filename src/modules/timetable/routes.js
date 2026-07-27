const express = require('express');
const controller = require('./controller');
const { validatePeriod, validateTimetableQuery, validateTimetableSave } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');
const timetableRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

router.get('/timetable-periods', adminOnly, controller.listPeriods);
router.post('/timetable-periods', adminOnly, validatePeriod, controller.createPeriod);
router.patch('/timetable-periods/:id', adminOnly, validatePeriod, controller.updatePeriod);
router.delete('/timetable-periods/:id', adminOnly, controller.deletePeriod);

router.get('/timetable', timetableRoles, validateTimetableQuery, controller.getClassTimetable);
router.put('/timetable', timetableRoles, validateTimetableSave, controller.saveClassTimetable);

module.exports = router;
