const express = require('express');
const controller = require('./controller');
const {
  validateSalaryStructure, validatePayrollRun, validatePayPayrollRun, validateStatutoryRemittance,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const readRoles = requirePermission('payroll', 'VIEW');
// Compensation data is sensitive — salary structure edits and payroll
// approval are SCHOOL_ADMIN only, tighter than the general accounting
// bookkeeping tier, and not part of the editable matrix.
const adminOnly = requireRole('SCHOOL_ADMIN');
const payRoles = requirePermission('payroll', 'MANAGE');

router.get('/staff/:staffId/salary-structure', readRoles, controller.getSalaryStructure);
router.post('/staff/:staffId/salary-structure', adminOnly, validateSalaryStructure, controller.setSalaryStructure);

router.get('/payroll-runs', readRoles, controller.listPayrollRuns);
router.post('/payroll-runs', adminOnly, validatePayrollRun, controller.createPayrollRun);
router.get('/payroll-runs/:id', readRoles, controller.getPayrollRun);
router.post('/payroll-runs/:id/approve', adminOnly, controller.approvePayrollRun);
router.post('/payroll-runs/:id/pay', payRoles, validatePayPayrollRun, controller.payPayrollRun);
router.post('/payroll-runs/:id/email-payslips', payRoles, controller.emailPayrollRunPayslips);

router.post('/statutory-remittances', payRoles, validateStatutoryRemittance, controller.recordStatutoryRemittance);
router.get('/payroll-runs/:id/statutory-remittances', payRoles, controller.listStatutoryRemittancesForRun);

router.get('/payslips/:id', readRoles, controller.getPayslip);
router.post('/payslips/:id/email', payRoles, controller.emailPayslip);

// Self-service — deliberately NOT role-gated beyond authenticate/requireTenant:
// any staff member, whatever their role, can be linked to a Staff row and
// should see their own pay history. Ownership is enforced in the service
// layer (payroll/service.js#getMyPayslip), same pattern as parentPortal's
// "my children" routes.
router.get('/my/payslips', controller.listMyPayslips);
router.get('/my/payslips/:id', controller.getMyPayslip);

router.get('/payroll/statutory-settings', readRoles, controller.getStatutorySettings);
router.get('/payroll/analytics', readRoles, controller.getPayrollAnalytics);

module.exports = router;
