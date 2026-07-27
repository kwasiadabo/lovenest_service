const express = require('express');
const controller = require('./controller');
const { validateSubject } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/subjects', controller.listSubjects);
router.post('/subjects', adminOnly, validateSubject, controller.createSubject);
router.patch('/subjects/:subjectId', adminOnly, controller.updateSubject);
router.delete('/subjects/:subjectId', adminOnly, controller.deleteSubject);

module.exports = router;
