const express = require('express');
const controller = require('./controller');
const {
  validateSchemeCreate, validatePerformanceLevelsUpdate, validateCalculationTrigger,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const canView = requirePermission('assessmentGrading', 'VIEW');
const canManage = requirePermission('assessmentGrading', 'MANAGE');

router.get('/grading-schemes', canView, controller.listGradingSchemes);
router.post('/grading-schemes', canManage, validateSchemeCreate, controller.createGradingScheme);
router.get('/grading-schemes/:id', canView, controller.getGradingScheme);
router.put('/grading-schemes/:id', canManage, controller.updateGradingScheme);
router.post('/grading-schemes/:id/activate', canManage, controller.activateGradingScheme);
router.put(
  '/grading-schemes/:id/performance-levels',
  canManage,
  validatePerformanceLevelsUpdate,
  controller.updatePerformanceLevels,
);

router.post('/results/calculate', canManage, validateCalculationTrigger, controller.triggerCalculation);

router.get('/students/:studentId/ranking', canView, controller.getStudentRanking);
router.get('/students/:studentId/percentile', canView, controller.getStudentPercentile);
router.get('/students/:studentId/stanine', canView, controller.getStudentStanine);
router.get('/classes/:classId/stanine-distribution', canView, controller.getClassStanineDistribution);

module.exports = router;
