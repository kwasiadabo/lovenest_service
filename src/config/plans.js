// Population-tiered pricing per term. Tier is never a free client choice —
// it's derived from student population (see
// billing/service.js#resolveCurrentTier): the school's onboarding figure for
// its first billing cycle, then a live COUNT of ACTIVE students at every
// renewal after that.
const PLANS = [
  {
    code: 'trial',
    name: 'Trial',
    amountPesewas: 0,
    currency: 'GHS',
    interval: 'trial',
    durationDays: 30,
    smsAllowance: 0,
    populationMin: null,
    populationMax: null,
    description: 'Explore the platform with a single school.',
    features: ['1 school', 'Core academic setup', 'Email support'],
  },
  {
    code: 'tier_small',
    name: 'Starter',
    amountPesewas: 157500, // GH₵ 1,575.00 per term (GH₵1,500 + 5%)
    currency: 'GHS',
    interval: 'term',
    durationDays: 120,
    smsAllowance: 1500,
    populationMin: 0,
    populationMax: 150,
    description: 'For schools with up to 150 students.',
    features: ['Up to 150 students', '1,500 SMS/term', 'Priority support'],
  },
  {
    code: 'tier_medium',
    name: 'Growth',
    amountPesewas: 262500, // GH₵ 2,625.00 per term (GH₵2,500 + 5%)
    currency: 'GHS',
    interval: 'term',
    durationDays: 120,
    smsAllowance: 2500,
    populationMin: 151,
    populationMax: 300,
    description: 'For schools with 151-300 students.',
    features: ['Up to 300 students', '2,500 SMS/term', 'Priority support'],
  },
  {
    code: 'tier_large',
    name: 'Enterprise',
    amountPesewas: 472500, // GH₵ 4,725.00 per term (GH₵4,500 + 5%)
    currency: 'GHS',
    interval: 'term',
    durationDays: 120,
    smsAllowance: 10000,
    populationMin: 301,
    populationMax: null,
    description: 'For schools with more than 300 students.',
    features: ['Unlimited students', '10,000 SMS/term', 'Dedicated support'],
  },
];

function getPlan(code) {
  return PLANS.find((plan) => plan.code === code);
}

// Resolves the population-based tier for a given student count. Only
// considers the non-trial tiers (trial is a time-limited free choice, never
// population-derived). The top tier is unbounded so this only returns
// undefined if count itself is invalid (negative/NaN).
function resolveTierForPopulation(count) {
  if (!Number.isFinite(count) || count < 0) return undefined;
  return PLANS.find(
    (plan) => plan.populationMin !== null
      && count >= plan.populationMin
      && (plan.populationMax === null || count <= plan.populationMax),
  );
}

module.exports = { PLANS, getPlan, resolveTierForPopulation };
