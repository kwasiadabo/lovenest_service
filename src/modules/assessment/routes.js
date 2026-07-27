const express = require('express');
const controller = require('./controller');
const {
  validateAssessmentItem, validateScoreUpsert, validateExamScoreSave, validateExamScoreScope,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const assessmentRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER');
const schoolAdminOnly = requireRole('SCHOOL_ADMIN');
// Whole-school, cross-class reporting — not the per-class/subject scope a
// plain TEACHER is otherwise restricted to, so this is oversight-only.
const analyticsRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

router.get('/assessment/my-assignments', assessmentRoles, controller.getMyAssignments);

router.get('/assessment/grid', assessmentRoles, controller.getAssessmentGrid);
router.post('/assessment/items', assessmentRoles, validateAssessmentItem, controller.createItem);
router.patch('/assessment/items/:itemId', assessmentRoles, controller.updateItem);
router.delete('/assessment/items/:itemId', assessmentRoles, controller.deleteItem);
router.put('/assessment/scores/:itemId/:studentId', assessmentRoles, validateScoreUpsert, controller.upsertScore);

router.get('/assessment/exam-grid', assessmentRoles, controller.getExamGrid);
router.put('/assessment/exam-scores', assessmentRoles, validateExamScoreSave, controller.saveExamScore);
router.post('/assessment/exam-scores/confirm', assessmentRoles, validateExamScoreScope, controller.confirmExamScores);
router.post('/assessment/exam-scores/reopen', schoolAdminOnly, validateExamScoreScope, controller.reopenExamScores);

router.get('/assessment/analytics', analyticsRoles, controller.getExamAnalytics);
router.get('/assessment/my-analytics', assessmentRoles, controller.getMyExamAnalytics);
router.get('/assessment/student-trend', assessmentRoles, controller.getStudentSubjectTrend);

module.exports = router;
