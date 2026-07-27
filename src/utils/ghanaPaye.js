const { Op } = require('sequelize');
const { PayeTaxBand, SsnitRate } = require('../models');

// SSNIT (Social Security and National Insurance Trust) contribution rates —
// applied to basic salary only (not total gross with allowances), matching
// standard Ghanaian payroll practice. Platform-level, versioned data (see
// models/ssnitrate.js) — resolved "as of" the pay period so a rate change
// made later (via the platform Statutory Settings screen) never
// retroactively alters an already-computed payslip.
async function getSsnitRates(asOfDate) {
  const rate = await SsnitRate.findOne({
    where: { effectiveFrom: { [Op.lte]: asOfDate } },
    order: [['effectiveFrom', 'DESC']],
  });
  if (!rate) return { employeeRate: 0, employerRate: 0 };
  return {
    employeeRate: Number(rate.employeeRatePercent) / 100,
    employerRate: Number(rate.employerRatePercent) / 100,
  };
}

// Illustrative Ghana Revenue Authority monthly PAYE bands — seeded via
// seeders/20260101000002-paye-tax-bands.js. MUST be verified/updated by the
// school's accountant against the current GRA schedule before relying on
// this for real payroll; tax bands change periodically and this file only
// ever reads whatever is seeded, never hardcodes the numbers itself.
async function computeMonthlyPaye(taxableIncomePesewas, asOfDate) {
  const bands = await PayeTaxBand.findAll({
    where: { effectiveFrom: { [Op.lte]: asOfDate } },
    order: [['effectiveFrom', 'DESC'], ['bandOrder', 'ASC']],
  });
  if (bands.length === 0) return 0;

  const latestEffectiveFrom = bands[0].effectiveFrom;
  const activeBands = bands
    .filter((b) => b.effectiveFrom === latestEffectiveFrom)
    .sort((a, b) => a.bandOrder - b.bandOrder);

  let remaining = taxableIncomePesewas;
  let paye = 0;
  for (const band of activeBands) {
    if (remaining <= 0) break;
    const bandSizePesewas = band.upToPesewas === null ? remaining : Number(band.upToPesewas);
    const taxableInBand = Math.min(remaining, bandSizePesewas);
    paye += Math.round(taxableInBand * (Number(band.ratePercent) / 100));
    remaining -= taxableInBand;
  }
  return paye;
}

module.exports = { getSsnitRates, computeMonthlyPaye };
