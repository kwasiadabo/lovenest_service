const express = require('express');
const controller = require('./controller');
const {
  validateGenerateQuery, validateClassSummaryQuery, validateRemarksUpdate, validateHeadteacherRemarkUpdate,
  validateClassNextTermStartDateUpdate,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const reportCardRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER', 'TEACHER');
const headteacherOrAdmin = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

router.get('/report-cards/generate', reportCardRoles, validateGenerateQuery, controller.generate);
router.get('/report-cards/class-summary', reportCardRoles, validateClassSummaryQuery, controller.classSummary);
router.get('/report-cards/:studentId/:termId/remarks', reportCardRoles, controller.getRemarks);
router.put('/report-cards/:studentId/:termId/remarks', reportCardRoles, validateRemarksUpdate, controller.updateRemarks);
router.put(
  '/report-cards/:studentId/:termId/headteacher-remark',
  headteacherOrAdmin,
  validateHeadteacherRemarkUpdate,
  controller.updateHeadteacherRemark,
);
router.post('/report-cards/:studentId/:termId/publish', reportCardRoles, controller.publish);
router.post('/report-cards/class/:classId/:termId/publish-all', reportCardRoles, controller.publishAll);
router.put(
  '/report-cards/class/:classId/:termId/next-term-start-date',
  reportCardRoles,
  validateClassNextTermStartDateUpdate,
  controller.setClassNextTermStartDate,
);

module.exports = router;
