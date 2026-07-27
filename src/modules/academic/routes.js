const express = require('express');
const controller = require('./controller');
const { validateAcademicYear, validateTerm, validateClass, validateClassPromotionMapping } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/academic-years', controller.listAcademicYears);
router.post('/academic-years', adminOnly, validateAcademicYear, controller.createAcademicYear);
router.patch('/academic-years/:academicYearId', adminOnly, controller.updateAcademicYear);
router.patch('/academic-years/:academicYearId/set-current', adminOnly, controller.setCurrentAcademicYear);

router.get('/terms', controller.listTerms);
router.post('/academic-years/:academicYearId/terms', adminOnly, validateTerm, controller.createTerm);
router.patch('/terms/:termId', adminOnly, controller.updateTerm);
router.patch('/terms/:termId/set-current', adminOnly, controller.setCurrentTerm);

router.get('/levels', controller.listLevels);

router.get('/classes', controller.listClasses);
router.post('/classes', adminOnly, validateClass, controller.createClass);
router.patch('/classes/:classId', adminOnly, validateClassPromotionMapping, controller.updateClass);
router.delete('/classes/:classId', adminOnly, controller.deleteClass);

module.exports = router;
