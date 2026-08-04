// Termly subscription pricing shown at self-serve registration (the public
// marketing site's pricing page + onboarding form) — population-tiered,
// but deliberately separate from config/plans.js. plans.js prices ongoing
// renewals off a live COUNT of ACTIVE students once a school already
// exists; this only ever prices a school's very first term, at signup,
// before there's any student data to count, and uses different price
// points/breakpoints than plans.js.
const ONBOARDING_TIERS = [
  {
    code: 'reg_up_to_300',
    label: 'Up to 300 students',
    populationMin: 0,
    populationMax: 300,
    amountPesewas: 249900, // GH₵ 2,499.00 per term
  },
  {
    code: 'reg_301_400',
    label: '301–400 students',
    populationMin: 301,
    populationMax: 400,
    amountPesewas: 299900, // GH₵ 2,999.00 per term
  },
  {
    code: 'reg_401_500',
    label: '401–500 students',
    populationMin: 401,
    populationMax: 500,
    amountPesewas: 349900, // GH₵ 3,499.00 per term
  },
  {
    code: 'reg_over_500',
    label: 'Over 500 students',
    populationMin: 501,
    populationMax: null,
    // No fixed price — resolveOnboardingTier still returns this tier so
    // callers can show a "contact us" message, but amountPesewas stays
    // null so nothing accidentally gets charged automatically.
    amountPesewas: null,
  },
];

// Top tier is unbounded, so this only returns undefined if count itself is
// invalid (negative/NaN).
function resolveOnboardingTier(population) {
  if (!Number.isFinite(population) || population < 0) return undefined;
  return ONBOARDING_TIERS.find(
    (tier) => population >= tier.populationMin
      && (tier.populationMax === null || population <= tier.populationMax),
  );
}

module.exports = { ONBOARDING_TIERS, resolveOnboardingTier };
