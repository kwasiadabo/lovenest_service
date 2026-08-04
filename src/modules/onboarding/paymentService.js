const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { PendingSchoolRegistration } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { resolveOnboardingTier } = require('../../config/onboardingPricing');
const { TRAINING_COSTS_PESEWAS } = require('../../config/training');
const { checkRegistrationAvailable, createSchoolRecord, SALT_ROUNDS } = require('./service');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function requireSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new ApiError(500, 'Payment provider is not configured yet');
  }
  return key;
}

// Pre-registration payment: subscription (population-tiered, see
// config/onboardingPricing.js) + the mandatory training fee, charged
// together in one Paystack transaction before the school exists. The form
// data is parked in a PendingSchoolRegistration row and only turned into an
// actual School once Paystack confirms the charge (see
// completeRegistration below, invoked from either the redirect-verify path
// or the webhook — whichever arrives first).
async function initializeRegistrationPayment(fields) {
  await checkRegistrationAvailable(fields);

  const tier = resolveOnboardingTier(fields.studentPopulation);
  if (!tier) {
    throw new ApiError(400, 'Could not resolve a pricing tier for this student population');
  }
  if (tier.amountPesewas === null) {
    throw new ApiError(
      409,
      'Schools with more than 500 students need a custom quote — please contact us directly instead of registering here.',
    );
  }

  const trainingAmountPesewas = TRAINING_COSTS_PESEWAS[fields.trainingMode];
  const amountPesewas = tier.amountPesewas + trainingAmountPesewas;

  // Never persist the plaintext password, even in a short-lived pending
  // row — hash it now and carry the hash through to createSchoolRecord at
  // completion time.
  const passwordHash = await bcrypt.hash(fields.adminPassword, SALT_ROUNDS);
  const { adminPassword: _adminPassword, ...rest } = fields;
  const payload = { ...rest, passwordHash };

  const reference = `vx_reg_${crypto.randomUUID()}`;

  const pending = await PendingSchoolRegistration.create({
    reference,
    email: fields.adminEmail,
    payload: JSON.stringify(payload),
    tierCode: tier.code,
    subscriptionAmountPesewas: tier.amountPesewas,
    trainingAmountPesewas,
    amountPesewas,
    status: 'pending',
  });

  const secretKey = requireSecretKey();
  const marketingUrl = process.env.MARKETING_URL || 'http://localhost:5174';

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
        email: fields.adminEmail,
        amount: amountPesewas,
        currency: 'GHS',
        reference,
        callback_url: `${marketingUrl}/onboarding/callback`,
        metadata: { purpose: 'school_registration', pendingRegistrationId: pending.id },
      }),
    });
    data = await response.json();
  } catch (err) {
    pending.status = 'failed';
    await pending.save();
    throw new ApiError(502, 'Could not reach payment provider');
  }

  if (!response.ok || !data.status) {
    pending.status = 'failed';
    await pending.save();
    throw new ApiError(502, data.message || 'Failed to initialize payment');
  }

  return { authorizationUrl: data.data.authorization_url, reference, amountPesewas };
}

// Idempotent — safe to call from both the redirect-verify path and the
// webhook, whichever gets there first.
async function completeRegistration(pending) {
  if (pending.status === 'completed') {
    return pending;
  }

  const payload = JSON.parse(pending.payload);
  const { school } = await createSchoolRecord({ ...payload, forcePasswordChange: true });

  pending.status = 'completed';
  pending.schoolId = school.id;
  pending.completedAt = new Date();
  await pending.save();

  return pending;
}

async function verifyRegistrationPayment(reference) {
  const pending = await PendingSchoolRegistration.findOne({ where: { reference } });
  if (!pending) {
    throw new ApiError(404, 'Registration payment not found');
  }
  if (pending.status === 'completed') {
    return pending;
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
    && tx.amount === pending.amountPesewas
    && tx.currency === 'GHS';

  pending.rawResponse = JSON.stringify(tx);

  if (!isValid) {
    pending.status = 'failed';
    await pending.save();
    throw new ApiError(400, 'Payment could not be verified');
  }

  await pending.save();
  await completeRegistration(pending);
  return pending;
}

// Called from billing/controller.js#webhook alongside the existing billing
// handler — both check the reference prefix and no-op if it's not theirs,
// so one Paystack webhook URL can safely serve both flows.
async function handleWebhookEvent(event) {
  if (event.event !== 'charge.success') return;
  const reference = event.data && event.data.reference;
  if (!reference || !reference.startsWith('vx_reg_')) return;

  const pending = await PendingSchoolRegistration.findOne({ where: { reference } });
  if (!pending || pending.status === 'completed') return;

  const isValid = event.data.status === 'success'
    && event.data.amount === pending.amountPesewas
    && event.data.currency === 'GHS';
  if (!isValid) return;

  pending.rawResponse = JSON.stringify(event.data);
  await pending.save();
  await completeRegistration(pending);
}

module.exports = { initializeRegistrationPayment, verifyRegistrationPayment, handleWebhookEvent };
