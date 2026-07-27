const express = require('express');
const controller = require('./controller');
const { validateActivity, validateRatingSave, validateRatingScope } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const assessmentRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER');
const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/activities', assessmentRoles, controller.listActivities);
router.post('/activities', adminOnly, validateActivity, controller.createActivity);
router.patch('/activities/:activityId', adminOnly, controller.updateActivity);
router.delete('/activities/:activityId', adminOnly, controller.deleteActivity);

router.get('/activities/rating-grid', assessmentRoles, controller.getRatingGrid);
router.put('/activities/ratings', assessmentRoles, validateRatingSave, controller.saveRating);
router.post('/activities/ratings/confirm', assessmentRoles, validateRatingScope, controller.confirmRatings);
router.post('/activities/ratings/reopen', adminOnly, validateRatingScope, controller.reopenRatings);

module.exports = router;
