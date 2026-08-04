const express = require('express');
const controller = require('./controller');
const { validateBudget } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const readRoles = requirePermission('budgeting', 'VIEW');
const writeRoles = requirePermission('budgeting', 'CONTRIBUTE');
// Budget approval stays SCHOOL_ADMIN-only, not part of the editable matrix.
const approveRoles = requireRole('SCHOOL_ADMIN');

router.get('/budgets', readRoles, controller.listBudgets);
router.post('/budgets', writeRoles, validateBudget, controller.createBudget);
router.get('/budgets/:id', readRoles, controller.getBudget);
router.patch('/budgets/:id', writeRoles, validateBudget, controller.updateBudget);
router.post('/budgets/:id/approve', approveRoles, controller.approveBudget);
router.get('/budgets/:id/vs-actual', readRoles, controller.getBudgetVsActual);

module.exports = router;
