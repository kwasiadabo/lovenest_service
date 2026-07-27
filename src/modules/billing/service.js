const crypto = require('crypto');
const { School, Payment, Student, TrainingEnrollment, sequelize } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { PLANS, getPlan, resolveTierForPopulation } = require('../../config/plans');
const { SCHOOL_SAFE_ATTRIBUTES } = require('../../utils/schoolSafeQuery');
const { buildPlatformPaymentReceiptPdf } = require('../../utils/platformReceiptPdf');

const MODE_LABELS = { IN_PERSON: 'In-Person', ONLINE: 'Online' };

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function requireSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new ApiError(500, 'Payment provider is not configured yet');
  }
  return key;
}

function listPlans() {
  return PLANS.map(({ code, name, amountPesewas, currency, interval, description, features }) => ({
    code,
    name,
    amountPesewas,
    currency,
    interval,
    description,
    features,
  }));
}

// Tier is never a free client choice. A school's very first billing cycle
// (no prior successful payment) uses the population figure captured at
// onboarding; every renewal after that re-evaluates from a live COUNT of
// ACTIVE students, so a school that's grown or shrunk pays the correct tier
// without anyone having to remember to update it manually.
async function resolveCurrentTier(school) {
  const priorSuccessCount = await Payment.count({ where: { schoolId: school.id, status: 'success' } });
  const population = priorSuccessCount > 0
    ? await Student.count({ where: { schoolId: school.id, status: 'ACTIVE' } })
    : school.studentPopulation;
  const plan = resolveTierForPopulation(population);
  if (!plan) {
    throw new ApiError(500, 'Could not resolve a pricing tier for this school');
  }
  return { plan, population };
}

async function startTrial(schoolId) {
  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }
  if (school.status !== 'pending') {
    throw new ApiError(409, 'This school has already selected a plan');
  }

  const plan = getPlan('trial');
  school.status = 'trial';
  school.planCode = plan.code;
  school.subscriptionExpiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
  school.smsAllowance = plan.smsAllowance;
  school.smsUsedThisCycle = 0;
  school.reminder14SentAt = null;
  school.reminder3SentAt = null;
  await school.save();
  return school;
}

async function getMyTier(schoolId) {
  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }
  const priorSuccessCount = await Payment.count({ where: { schoolId: school.id, status: 'success' } });
  const { plan, population } = await resolveCurrentTier(school);
  return { plan, populationUsed: population, isFirstCycle: priorSuccessCount === 0 };
}

async function initializePayment(schoolId, email) {
  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }
  if (!['pending', 'trial', 'suspended'].includes(school.status)) {
    throw new ApiError(409, 'This school does not need to make a payment right now');
  }

  const { plan } = await resolveCurrentTier(school);

  const secretKey = requireSecretKey();
  const reference = `vx_${crypto.randomUUID()}`;

  const payment = await Payment.create({
    schoolId,
    purpose: 'subscription',
    planCode: plan.code,
    amountPesewas: plan.amountPesewas,
    currency: plan.currency,
    reference,
    status: 'pending',
  });

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  let response;
  let data;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: plan.amountPesewas,
        currency: plan.currency,
        reference,
        callback_url: `${appUrl}/billing/callback`,
        metadata: { schoolId, planCode: plan.code },
      }),
    });
    data = await response.json();
  } catch (err) {
    payment.status = 'failed';
    await payment.save();
    throw new ApiError(502, 'Could not reach payment provider');
  }

  if (!response.ok || !data.status) {
    payment.status = 'failed';
    await payment.save();
    throw new ApiError(502, data.message || 'Failed to initialize payment');
  }

  return { authorizationUrl: data.data.authorization_url, reference };
}

async function getMyTraining(schoolId) {
  const enrollment = await TrainingEnrollment.findOne({ where: { schoolId } });
  return enrollment;
}

// Mandatory one-time training fee — same Paystack mechanics as
// initializePayment above, just a fixed amount from the school's own
// TrainingEnrollment (not a resolved tier) and purpose: 'training' so
// applySuccessfulPayment routes it differently on success.
async function initializeTrainingPayment(schoolId, email) {
  const enrollment = await TrainingEnrollment.findOne({ where: { schoolId } });
  if (!enrollment) {
    throw new ApiError(404, 'No training enrollment found for this school');
  }
  if (enrollment.paymentStatus === 'paid') {
    throw new ApiError(409, 'Training has already been paid for');
  }

  const secretKey = requireSecretKey();
  const reference = `vx_training_${crypto.randomUUID()}`;

  const payment = await Payment.create({
    schoolId,
    purpose: 'training',
    planCode: `training_${enrollment.mode.toLowerCase()}`,
    amountPesewas: enrollment.costPesewas,
    currency: 'GHS',
    reference,
    status: 'pending',
  });

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  let response;
  let data;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: enrollment.costPesewas,
        currency: 'GHS',
        reference,
        callback_url: `${appUrl}/billing/callback`,
        metadata: { schoolId, purpose: 'training' },
      }),
    });
    data = await response.json();
  } catch (err) {
    payment.status = 'failed';
    await payment.save();
    throw new ApiError(502, 'Could not reach payment provider');
  }

  if (!response.ok || !data.status) {
    payment.status = 'failed';
    await payment.save();
    throw new ApiError(502, data.message || 'Failed to initialize payment');
  }

  return { authorizationUrl: data.data.authorization_url, reference };
}

// Idempotent: safe to call from both the redirect-verify path and the
// webhook. Branches on payment.purpose — a training payment only marks that
// one-time fee paid; it must never touch the school's
// status/planCode/subscriptionExpiresAt/smsAllowance, which are owned
// exclusively by subscription payments.
async function applySuccessfulPayment(payment) {
  if (payment.status === 'success') {
    return payment;
  }

  if (payment.purpose === 'training') {
    await sequelize.transaction(async (t) => {
      payment.status = 'success';
      payment.paidAt = new Date();
      await payment.save({ transaction: t });

      const enrollment = await TrainingEnrollment.findOne({ where: { schoolId: payment.schoolId }, transaction: t });
      enrollment.paymentStatus = 'paid';
      enrollment.paidAt = new Date();
      await enrollment.save({ transaction: t });
    });

    return payment;
  }

  const plan = getPlan(payment.planCode);
  const school = await School.findByPk(payment.schoolId, SCHOOL_SAFE_ATTRIBUTES);

  await sequelize.transaction(async (t) => {
    payment.status = 'success';
    payment.paidAt = new Date();
    await payment.save({ transaction: t });

    school.status = 'active';
    school.planCode = plan.code;
    school.subscriptionExpiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
    school.smsAllowance = plan.smsAllowance;
    school.smsUsedThisCycle = 0;
    school.reminder14SentAt = null;
    school.reminder3SentAt = null;
    await school.save({ transaction: t });
  });

  return payment;
}

async function verifyPayment(reference) {
  const payment = await Payment.findOne({ where: { reference } });
  if (!payment) {
    throw new ApiError(404, 'Payment not found');
  }
  if (payment.status === 'success') {
    return { payment, school: await School.findByPk(payment.schoolId, SCHOOL_SAFE_ATTRIBUTES) };
  }

  const secretKey = requireSecretKey();
  let response;
  let data;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    data = await response.json();
  } catch (err) {
    throw new ApiError(502, 'Could not reach payment provider');
  }

  if (!response.ok || !data.status) {
    throw new ApiError(502, data.message || 'Failed to verify payment');
  }

  const tx = data.data;
  const isValid = tx.status === 'success'
    && tx.amount === payment.amountPesewas
    && tx.currency === payment.currency;

  payment.rawResponse = JSON.stringify(tx);

  if (!isValid) {
    payment.status = 'failed';
    await payment.save();
    throw new ApiError(400, 'Payment could not be verified');
  }

  await payment.save();
  await applySuccessfulPayment(payment);
  const school = await School.findByPk(payment.schoolId, SCHOOL_SAFE_ATTRIBUTES);
  return { payment, school };
}

// Every payment the school has ever made — subscription renewals and the
// one-time training fee alike, newest first. Each row's `purpose` tells the
// frontend which label/receipt-description to show.
async function listPaymentHistory(schoolId) {
  return Payment.findAll({ where: { schoolId }, order: [['createdAt', 'DESC']] });
}

async function describePayment(payment) {
  if (payment.purpose === 'training') {
    const enrollment = await TrainingEnrollment.findOne({ where: { schoolId: payment.schoolId } });
    const mode = enrollment ? MODE_LABELS[enrollment.mode] || enrollment.mode : 'Onboarding';
    const attendees = enrollment ? ` — up to ${enrollment.attendeeCount} attendees` : '';
    return `${mode} onboarding training (3 days)${attendees}`;
  }
  const plan = getPlan(payment.planCode);
  return `${plan ? plan.name : payment.planCode} subscription (${payment.planCode})`;
}

// Receipts are only ever issued for a payment that actually succeeded — a
// pending/failed Payment row has nothing to receipt yet.
async function getPaymentReceipt(schoolId, paymentId) {
  const payment = await Payment.findOne({ where: { id: paymentId, schoolId } });
  if (!payment) {
    throw new ApiError(404, 'Payment not found');
  }
  if (payment.status !== 'success') {
    throw new ApiError(409, 'This payment has not been completed yet');
  }

  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  const description = await describePayment(payment);
  const pdfBuffer = await buildPlatformPaymentReceiptPdf({ school, payment, description });
  return { pdfBuffer, filename: `receipt-${payment.reference}.pdf` };
}

function verifyWebhookSignature(rawBody, signature) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey || !signature) {
    return false;
  }
  const hash = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  return hash === signature;
}

async function handleWebhookEvent(event) {
  if (event.event !== 'charge.success') {
    return;
  }
  const reference = event.data && event.data.reference;
  if (!reference) {
    return;
  }

  const payment = await Payment.findOne({ where: { reference } });
  if (!payment || payment.status === 'success') {
    return;
  }

  const isValid = event.data.status === 'success'
    && event.data.amount === payment.amountPesewas
    && event.data.currency === payment.currency;

  if (!isValid) {
    return;
  }

  payment.rawResponse = JSON.stringify(event.data);
  await payment.save();
  await applySuccessfulPayment(payment);
}

module.exports = {
  listPlans,
  startTrial,
  getMyTier,
  initializePayment,
  getMyTraining,
  initializeTrainingPayment,
  verifyPayment,
  verifyWebhookSignature,
  handleWebhookEvent,
  listPaymentHistory,
  getPaymentReceipt,
};
