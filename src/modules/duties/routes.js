const express = require('express');
const controller = require('./controller');
const { validateStaffDuty, validateDutyRosterEntry } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/staff-duties', controller.listStaffDuties);
router.post('/staff-duties', adminOnly, validateStaffDuty, controller.createStaffDuty);
router.patch('/staff-duties/:dutyId', adminOnly, controller.updateStaffDuty);
router.delete('/staff-duties/:dutyId', adminOnly, controller.deleteStaffDuty);

router.get('/duty-roster', adminOnly, controller.listDutyRoster);
router.post('/duty-roster', adminOnly, validateDutyRosterEntry, controller.createDutyRosterEntry);
router.delete('/duty-roster/:id', adminOnly, controller.deleteDutyRosterEntry);

module.exports = router;
