const express = require('express');
const controller = require('./controller');
const {
  validateCreateIncident, validateUpdateIncident, validateIncidentStatus, validateIncidentAction,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Admin/Head Teacher only, for every operation — this module has no
// broader-role view like staff duties do.
const adminOrHeadTeacher = requirePermission('incidents', 'CONTRIBUTE');
// Deleting an incident stays SCHOOL_ADMIN-only, not part of the editable matrix.
const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/incidents/analytics', adminOrHeadTeacher, controller.getIncidentAnalytics);
router.get('/incidents', adminOrHeadTeacher, controller.listIncidents);
router.post('/incidents', adminOrHeadTeacher, validateCreateIncident, controller.createIncident);
router.get('/incidents/:id', adminOrHeadTeacher, controller.getIncident);
router.patch('/incidents/:id', adminOrHeadTeacher, validateUpdateIncident, controller.updateIncident);
router.patch('/incidents/:id/status', adminOrHeadTeacher, validateIncidentStatus, controller.setIncidentStatus);
router.patch('/incidents/:id/action', adminOrHeadTeacher, validateIncidentAction, controller.recordAction);
router.delete('/incidents/:id', adminOnly, controller.deleteIncident);

module.exports = router;
