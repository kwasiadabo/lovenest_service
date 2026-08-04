const express = require('express');
const controller = require('./controller');
const { validateSubjectTeacher, validateClassTeacher } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requirePermission('teacherAssignments', 'MANAGE');

router.get('/subject-teachers', adminOnly, controller.listSubjectTeachers);
router.post('/subject-teachers', adminOnly, validateSubjectTeacher, controller.assignSubjectTeacher);
router.delete('/subject-teachers/:id', adminOnly, controller.removeSubjectTeacher);

router.get('/class-teachers', adminOnly, controller.listClassTeachers);
router.post('/class-teachers', adminOnly, validateClassTeacher, controller.addClassTeacher);
router.delete('/class-teachers/:id', adminOnly, controller.removeClassTeacher);

module.exports = router;
