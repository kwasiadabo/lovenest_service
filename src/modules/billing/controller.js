const billingService = require('./service');
const onboardingPaymentService = require('../onboarding/paymentService');
const parentPortalService = require('../parentPortal/service');
const { User } = require('../../models');

async function listPlans(req, res, next) {
  try {
    res.json(billingService.listPlans());
  } catch (err) {
    next(err);
  }
}

async function startTrial(req, res, next) {
  try {
    const school = await billingService.startTrial(req.schoolId);
    res.json({ school });
  } catch (err) {
    next(err);
  }
}

async function initializePayment(req, res, next) {
  try {
    const user = await User.findByPk(req.auth.userId);
    const result = await billingService.initializePayment(req.schoolId, user.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMyTier(req, res, next) {
  try {
    const result = await billingService.getMyTier(req.schoolId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getBillingStatus(req, res, next) {
  try {
    const result = await billingService.getBillingStatus(req.schoolId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMyTraining(req, res, next) {
  try {
    const enrollment = await billingService.getMyTraining(req.schoolId);
    res.json(enrollment);
  } catch (err) {
    next(err);
  }
}

async function initializeTrainingPayment(req, res, next) {
  try {
    const user = await User.findByPk(req.auth.userId);
    const result = await billingService.initializeTrainingPayment(req.schoolId, user.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const result = await billingService.verifyPayment(req.schoolId, req.params.reference);
    res.json({
      school: result.school, status: result.payment.status, purpose: result.payment.purpose,
    });
  } catch (err) {
    next(err);
  }
}

async function listPaymentHistory(req, res, next) {
  try {
    const payments = await billingService.listPaymentHistory(req.schoolId);
    res.json(payments);
  } catch (err) {
    next(err);
  }
}

async function getPaymentReceipt(req, res, next) {
  try {
    const { pdfBuffer, filename } = await billingService.getPaymentReceipt(req.schoolId, req.params.paymentId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

// Public endpoint called directly by Paystack — no JWT, verified via HMAC
// signature instead. Mounted with express.raw() so the body is available
// as an untouched Buffer for the signature check. Serves both this
// module's own payments AND the marketing site's pre-registration payments
// (see onboarding/paymentService.js) — one Paystack webhook URL, both
// handlers check the event's reference prefix and no-op if it isn't
// theirs, so dispatching to both here is safe either way.
async function webhook(req, res, next) {
  try {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.body;

    if (!billingService.verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    await billingService.handleWebhookEvent(event);
    await onboardingPaymentService.handleWebhookEvent(event);
    await parentPortalService.handleFeePaymentWebhookEvent(event);
    return res.status(200).json({ received: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listPlans,
  startTrial,
  getMyTier,
  getBillingStatus,
  initializePayment,
  getMyTraining,
  initializeTrainingPayment,
  verifyPayment,
  webhook,
  listPaymentHistory,
  getPaymentReceipt,
};
