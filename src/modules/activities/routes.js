const express = require('express');
const controller = require('./controller');
const {
  validateActivity, validateRatingSave, validateRatingScope, validateDailyLogSave,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const assessmentRoles = requirePermission('activities', 'CONTRIBUTE');
// Delete/reopen stay SCHOOL_ADMIN-only, not part of the editable matrix —
// see the destructive-cross-class-action comments below.
const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/activities', assessmentRoles, controller.listActivities);
// Create/update open to class teachers, not just admins, so a creche
// teacher can set up their own activity list day-to-day. Delete stays
// admin-only — it cascades-clears every class's ratings for that activity
// across every term (see service.js#deleteActivity), a destructive
// cross-class action unlike day-to-day setup.
router.post('/activities', assessmentRoles, validateActivity, controller.createActivity);
router.patch('/activities/:activityId', assessmentRoles, controller.updateActivity);
router.delete('/activities/:activityId', adminOnly, controller.deleteActivity);

router.get('/activities/rating-grid', assessmentRoles, controller.getRatingGrid);
router.put('/activities/ratings', assessmentRoles, validateRatingSave, controller.saveRating);
router.post('/activities/ratings/confirm', assessmentRoles, validateRatingScope, controller.confirmRatings);
router.post('/activities/ratings/reopen', adminOnly, validateRatingScope, controller.reopenRatings);

router.get('/activities/daily-log', assessmentRoles, controller.getDailyLogGrid);
router.put('/activities/daily-log', assessmentRoles, validateDailyLogSave, controller.saveDailyLogEntry);

module.exports = router;
