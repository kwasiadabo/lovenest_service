const express = require('express');
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

// Webhook is registered separately in app.js (needs a raw body + no auth).
router.use(authenticate, requireTenant, requireRole('SCHOOL_ADMIN'));

router.get('/plans', controller.listPlans);
router.get('/my-tier', controller.getMyTier);
router.get('/status', controller.getBillingStatus);
router.post('/start-trial', controller.startTrial);
router.post('/initialize', controller.initializePayment);
router.get('/my-training', controller.getMyTraining);
router.post('/initialize-training', controller.initializeTrainingPayment);
router.get('/verify/:reference', controller.verifyPayment);
router.get('/payment-history', controller.listPaymentHistory);
router.get('/payments/:paymentId/receipt', controller.getPaymentReceipt);

module.exports = router;
