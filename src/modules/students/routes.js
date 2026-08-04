const express = require('express');
const controller = require('./controller');
const {
  validateStudent,
  validateStudentStatus,
  validateStudentDiscount,
  validateAdmissionPayment,
  validateClassAssignment,
  validatePromotion,
  validateConfirmPromotion,
  validateGraduateStudents,
  validateRelationshipParam,
  validateBirthdayMessage,
} = require('./validators');
const { uploadStudentPhoto } = require('../../middleware/studentPhoto');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requirePermission('students', 'MANAGE');
// Parent-login provisioning is an administrative action (mirrors how staff
// accounts are created), not a classroom one — deliberately excludes plain
// TEACHER, unlike some other assessment-adjacent actions in this app.
const adminOrHeadTeacher = requirePermission('students', 'CONTRIBUTE');
// Birthday nudges are a class-teacher responsibility (mirrors attendance's
// ClassTeacher scoping), not admin-only like the rest of this router.
const teacherOrAbove = requirePermission('students', 'VIEW');
// Same set as the frontend's BILLING_ROLES, which is who can reach the
// Student Profile page this full-history view attaches to — finer per-
// section gating (health/incidents/academics/attendance) happens inside
// fullHistory.js#sectionAccess, not here.
const billingRoles = requirePermission('students', 'VIEW');

router.get('/students', adminOnly, controller.listStudents);
router.get('/students/upcoming-birthdays', teacherOrAbove, controller.getUpcomingBirthdays);
router.post('/students/:id/birthday-message', teacherOrAbove, validateBirthdayMessage, controller.sendBirthdayMessage);
router.get('/students/:id/full-history', billingRoles, controller.getFullHistory);
router.get('/admission-payments', billingRoles, controller.getAdmissionPaymentsReport);
router.post('/students', adminOnly, uploadStudentPhoto, validateStudent, controller.createStudent);
router.patch('/students/:id', adminOnly, uploadStudentPhoto, validateStudent, controller.updateStudent);
router.patch('/students/:id/status', adminOnly, validateStudentStatus, controller.setStudentStatus);
router.post('/students/graduate', adminOnly, validateGraduateStudents, controller.graduateStudents);
router.patch('/students/:id/discount', adminOnly, validateStudentDiscount, controller.setStudentDiscount);
router.post('/students/:id/admission-payment', adminOnly, validateAdmissionPayment, controller.recordAdmissionPayment);
router.post(
  '/students/:id/parents/:relationship/create-login',
  adminOrHeadTeacher,
  validateRelationshipParam,
  controller.createParentLogin,
);
router.post(
  '/students/:id/parents/:relationship/reset-login-password',
  adminOrHeadTeacher,
  validateRelationshipParam,
  controller.resetParentLoginPassword,
);

router.get('/student-class-assignments', adminOnly, controller.listClassAssignments);
router.post('/student-class-assignments', adminOnly, validateClassAssignment, controller.assignStudentToClass);
router.delete('/student-class-assignments/:id', adminOnly, controller.removeClassAssignment);
router.post('/student-class-assignments/promote', adminOnly, validatePromotion, controller.promoteStudents);

router.get('/promotion-preview', adminOnly, controller.getPromotionPreview);
router.post('/promotion-confirm', adminOnly, validateConfirmPromotion, controller.confirmPromotion);
router.get('/promotion-batches', adminOnly, controller.listPromotionBatches);
router.get('/promotion-batches/:id', adminOnly, controller.getPromotionBatchDetail);

module.exports = router;
