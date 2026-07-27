const express = require('express');
const controller = require('./controller');
const { validateLevy, validateLevyPayment, validateLevyPaymentUpdate } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const levyRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT', 'HEAD_TEACHER');
// Reversing an already-posted payment is a narrower privilege than the
// levyRoles actions above — same role set as transport/financials'
// reversal routes. assertNotSelfReversal (service layer) additionally
// blocks whoever recorded the payment from being the one to reverse it.
const reversalRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT');

router.post('/levies', levyRoles, validateLevy, controller.createLevy);
router.get('/levies', levyRoles, controller.listLevies);
router.get('/levies/:id', levyRoles, controller.getLevy);
router.patch('/levies/:id', levyRoles, validateLevy, controller.updateLevy);
router.post('/levies/:id/close', levyRoles, controller.closeLevy);
router.post('/levies/:id/reopen', levyRoles, controller.reopenLevy);
router.delete('/levies/:id', levyRoles, controller.deleteLevy);
router.get('/levies/:id/collection', levyRoles, controller.getLevyCollection);
router.post('/levies/:id/students/:studentId/payments', levyRoles, validateLevyPayment, controller.recordLevyPayment);

router.get('/levy-payments', levyRoles, controller.listLevyPayments);
router.patch('/levy-payments/:id', levyRoles, validateLevyPaymentUpdate, controller.updateLevyPayment);
router.delete('/levy-payments/:id', reversalRoles, controller.deleteLevyPayment);
router.get('/levy-payments/:id/receipt', levyRoles, controller.getLevyPaymentReceipt);
router.get('/levy-payments/:id/revisions', levyRoles, controller.getLevyPaymentRevisions);

module.exports = router;
