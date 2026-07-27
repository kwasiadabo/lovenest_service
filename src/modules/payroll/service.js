const { Op } = require('sequelize');
const {
  sequelize, Staff, SalaryStructure, SalaryComponent, PayrollRun, Payslip, CashAccount, Term, PayeTaxBand, SsnitRate,
  School, StatutoryRemittance,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { postJournalEntry } = require('../accounting/ledgerPoster');
const { getSsnitRates, computeMonthlyPaye } = require('../../utils/ghanaPaye');
const { notifyPayslips } = require('./notify');

const STRUCTURE_INCLUDE = [{ model: SalaryComponent, as: 'components' }];

// ---- Salary structure ----

async function getSalaryStructure(schoolId, staffId) {
  return tenantScoped(SalaryStructure, schoolId).findOne({
    where: { staffId, isActive: true },
    include: STRUCTURE_INCLUDE,
  });
}

// Only one active structure per staff at a time — setting a new one
// deactivates the previous, mirroring financials/service.js's
// syncStudentDiscount "at most one active" pattern.
async function setSalaryStructure(schoolId, staffId, userId, {
  basicSalaryPesewas, effectiveDate, components,
}) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff not found');

  return sequelize.transaction(async (transaction) => {
    await tenantScoped(SalaryStructure, schoolId).update(
      { isActive: false },
      { where: { staffId, isActive: true }, transaction },
    );

    const structure = await tenantScoped(SalaryStructure, schoolId).create({
      staffId, basicSalaryPesewas, effectiveDate, createdByUserId: userId, isActive: true,
    }, { transaction });

    if (components?.length) {
      await tenantScoped(SalaryComponent, schoolId).bulkCreate(
        components.map((c) => ({
          salaryStructureId: structure.id,
          name: c.name,
          componentType: c.componentType,
          calcMethod: c.calcMethod,
          amountPesewas: c.calcMethod === 'FIXED' ? c.amountPesewas : null,
          percent: c.calcMethod === 'PERCENT_OF_BASIC' ? c.percent : null,
          taxable: c.taxable !== false,
        })),
        { transaction },
      );
    }

    return tenantScoped(SalaryStructure, schoolId).findByPk(structure.id, { include: STRUCTURE_INCLUDE, transaction });
  });
}

// ---- Payroll computation ----

function componentAmount(component, basicSalaryPesewas) {
  if (component.calcMethod === 'FIXED') return component.amountPesewas || 0;
  return Math.round((basicSalaryPesewas * Number(component.percent)) / 100);
}

async function computePayslipForStaff(structure, payPeriodEnd) {
  const basicSalaryPesewas = structure.basicSalaryPesewas;
  const allowances = structure.components.filter((c) => c.componentType === 'ALLOWANCE');
  const otherDeductions = structure.components.filter((c) => c.componentType === 'OTHER_DEDUCTION');

  let taxableAllowancesPesewas = 0;
  let totalAllowancesPesewas = 0;
  allowances.forEach((c) => {
    const amount = componentAmount(c, basicSalaryPesewas);
    totalAllowancesPesewas += amount;
    if (c.taxable) taxableAllowancesPesewas += amount;
  });

  const otherDeductionsPesewas = otherDeductions.reduce((sum, c) => sum + componentAmount(c, basicSalaryPesewas), 0);

  const grossPesewas = basicSalaryPesewas + totalAllowancesPesewas;
  const taxableIncomePesewas = basicSalaryPesewas + taxableAllowancesPesewas;
  const payePesewas = await computeMonthlyPaye(taxableIncomePesewas, payPeriodEnd);
  const { employeeRate, employerRate } = await getSsnitRates(payPeriodEnd);
  const ssnitEmployeePesewas = Math.round(basicSalaryPesewas * employeeRate);
  const ssnitEmployerPesewas = Math.round(basicSalaryPesewas * employerRate);
  const netPesewas = grossPesewas - payePesewas - ssnitEmployeePesewas - otherDeductionsPesewas;

  return {
    grossPesewas,
    payePesewas,
    ssnitEmployeePesewas,
    ssnitEmployerPesewas,
    otherDeductionsPesewas,
    netPesewas,
    breakdown: {
      basicSalaryPesewas, allowances, otherDeductions, taxableIncomePesewas,
    },
  };
}

async function resolvePeriod(schoolId, payPeriodEnd, transaction) {
  const term = await tenantScoped(Term, schoolId).findOne({
    where: { startDate: { [Op.lte]: payPeriodEnd }, endDate: { [Op.gte]: payPeriodEnd } },
    transaction,
  });
  return { academicYearId: term ? term.academicYearId : null, termId: term ? term.id : null };
}

// ---- Payroll runs ----

async function listPayrollRuns(schoolId) {
  return tenantScoped(PayrollRun, schoolId).findAll({ order: [['payPeriodStart', 'DESC']] });
}

async function getPayrollRun(schoolId, payrollRunId) {
  const run = await tenantScoped(PayrollRun, schoolId).findByPk(payrollRunId, {
    include: [{ model: Payslip, as: 'payslips', include: [Staff] }],
  });
  if (!run) throw new ApiError(404, 'Payroll run not found');
  return run;
}

async function createPayrollRun(schoolId, userId, { payPeriodStart, payPeriodEnd, payPeriodLabel }) {
  const runId = await sequelize.transaction(async (transaction) => {
    const structures = await tenantScoped(SalaryStructure, schoolId).findAll({
      where: { isActive: true },
      include: STRUCTURE_INCLUDE,
      transaction,
    });
    if (structures.length === 0) {
      throw new ApiError(400, 'No staff have an active salary structure — set one up first');
    }

    const { academicYearId, termId } = await resolvePeriod(schoolId, payPeriodEnd, transaction);

    const run = await tenantScoped(PayrollRun, schoolId).create({
      payPeriodStart, payPeriodEnd, payPeriodLabel, academicYearId, termId, status: 'DRAFT', createdByUserId: userId,
    }, { transaction });

    const totals = {
      gross: 0, paye: 0, ssnitEmployee: 0, ssnitEmployer: 0, otherDeductions: 0, net: 0,
    };

    for (const structure of structures) {
      const computed = await computePayslipForStaff(structure, payPeriodEnd);
      await tenantScoped(Payslip, schoolId).create({
        payrollRunId: run.id,
        staffId: structure.staffId,
        grossPesewas: computed.grossPesewas,
        payePesewas: computed.payePesewas,
        ssnitEmployeePesewas: computed.ssnitEmployeePesewas,
        ssnitEmployerPesewas: computed.ssnitEmployerPesewas,
        otherDeductionsPesewas: computed.otherDeductionsPesewas,
        netPesewas: computed.netPesewas,
        breakdownJson: JSON.stringify(computed.breakdown),
      }, { transaction });

      totals.gross += computed.grossPesewas;
      totals.paye += computed.payePesewas;
      totals.ssnitEmployee += computed.ssnitEmployeePesewas;
      totals.ssnitEmployer += computed.ssnitEmployerPesewas;
      totals.otherDeductions += computed.otherDeductionsPesewas;
      totals.net += computed.netPesewas;
    }

    await run.update({
      totalGrossPesewas: totals.gross,
      totalPayePesewas: totals.paye,
      totalSsnitEmployeePesewas: totals.ssnitEmployee,
      totalSsnitEmployerPesewas: totals.ssnitEmployer,
      totalOtherDeductionsPesewas: totals.otherDeductions,
      totalNetPesewas: totals.net,
    }, { transaction });

    return run.id;
  });
  // Deliberately fetched after the transaction commits — querying through
  // the eager-loaded getPayrollRun() from *inside* an open transaction
  // blocks on its own uncommitted locks (a real deadlock/timeout hit
  // against the live DB during development), since it doesn't run on the
  // same transaction/connection.
  return getPayrollRun(schoolId, runId);
}

// Recognizes the payroll expense/liability — Dr Salaries & Wages (basic),
// Dr Staff Allowances, Dr SSNIT - Employer / Cr PAYE Payable, SSNIT
// Payable (employee+employer), Other Payroll Deductions Payable, Net
// Salaries Payable. Balances since net = gross - paye - ssnitEmployee -
// otherDeductions and gross = basic + allowances.
async function approvePayrollRun(schoolId, payrollRunId, userId) {
  await sequelize.transaction(async (transaction) => {
    const run = await tenantScoped(PayrollRun, schoolId).findByPk(payrollRunId, { transaction });
    if (!run) throw new ApiError(404, 'Payroll run not found');
    if (run.status !== 'DRAFT') throw new ApiError(400, 'Only a draft payroll run can be approved');

    const payslips = await tenantScoped(Payslip, schoolId).findAll({ where: { payrollRunId }, transaction });
    const totalBasicPesewas = payslips.reduce((sum, p) => sum + (JSON.parse(p.breakdownJson).basicSalaryPesewas || 0), 0);
    const totalAllowancesPesewas = run.totalGrossPesewas - totalBasicPesewas;

    const lines = [
      { accountCode: '5000', debitPesewas: totalBasicPesewas },
      { accountCode: '5020', debitPesewas: run.totalSsnitEmployerPesewas },
      { accountCode: '2010', creditPesewas: run.totalPayePesewas },
      { accountCode: '2020', creditPesewas: run.totalSsnitEmployeePesewas + run.totalSsnitEmployerPesewas },
      { accountCode: '2040', creditPesewas: run.totalOtherDeductionsPesewas },
      { accountCode: '2030', creditPesewas: run.totalNetPesewas },
    ];
    if (totalAllowancesPesewas > 0) lines.push({ accountCode: '5010', debitPesewas: totalAllowancesPesewas });

    await postJournalEntry(schoolId, {
      entryDate: run.payPeriodEnd,
      description: `Payroll accrual: ${run.payPeriodLabel}`,
      sourceType: 'PAYROLL_ACCRUAL',
      sourceId: run.id,
      userId,
      lines: lines.filter((l) => (l.debitPesewas || 0) > 0 || (l.creditPesewas || 0) > 0),
    }, transaction);

    await run.update({ status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date() }, { transaction });
  });
  // See createPayrollRun's comment — never query the eager-loaded getter
  // from inside the transaction that's still holding the row's locks.
  return getPayrollRun(schoolId, payrollRunId);
}

async function payPayrollRun(schoolId, payrollRunId, userId, { cashAccountId }) {
  await sequelize.transaction(async (transaction) => {
    const run = await tenantScoped(PayrollRun, schoolId).findByPk(payrollRunId, { transaction });
    if (!run) throw new ApiError(404, 'Payroll run not found');
    if (run.status !== 'APPROVED') throw new ApiError(400, 'Only an approved payroll run can be paid');

    const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(cashAccountId, { transaction });
    if (!cashAccount) throw new ApiError(400, 'cashAccountId does not refer to a valid cash account');

    await postJournalEntry(schoolId, {
      entryDate: new Date().toISOString().slice(0, 10),
      description: `Payroll paid: ${run.payPeriodLabel}`,
      sourceType: 'PAYROLL_PAYMENT',
      sourceId: run.id,
      userId,
      lines: [
        { accountCode: '2030', debitPesewas: run.totalNetPesewas },
        { accountId: cashAccount.accountId, creditPesewas: run.totalNetPesewas },
      ],
    }, transaction);

    await run.update({
      status: 'PAID', paidByUserId: userId, paidAt: new Date(), cashAccountId,
    }, { transaction });
  });

  const run = await getPayrollRun(schoolId, payrollRunId);

  // Best-effort, same as notifyPaymentReceipt in financials — a bad email
  // address or a mail provider hiccup must never fail (or roll back) a
  // payroll run that's already posted and paid.
  let notifications = { email: { attempted: 0, sent: 0, failed: 0 } };
  try {
    const school = await School.findByPk(schoolId);
    notifications = await notifyPayslips(schoolId, { school, payrollRun: run, payslips: run.payslips });
  } catch (err) {
    notifications.error = err.message;
  }

  return { ...run.toJSON(), notifications };
}

// Clears PAYE/SSNIT Payable as the school actually remits to GRA/SSNIT.
// Tied to a specific payroll run (rather than freestanding) so a second
// remittance of the same type for the same run can be rejected outright —
// the unique index on statutory_remittances(schoolId, payrollRunId, type)
// is the hard backstop, this check just gives a clean 400 instead of a raw
// constraint-violation error. Only allowed once a run is APPROVED/PAID: a
// DRAFT run's totals aren't final and nothing has been posted to the GL yet,
// so there's nothing real to remit against.
async function recordStatutoryRemittance(schoolId, userId, {
  payrollRunId, type, amountPesewas, remittanceDate, cashAccountId, description,
}) {
  const accountCode = type === 'PAYE' ? '2010' : '2020';
  return sequelize.transaction(async (transaction) => {
    const run = await tenantScoped(PayrollRun, schoolId).findByPk(payrollRunId, { transaction });
    if (!run) throw new ApiError(404, 'Payroll run not found');
    if (run.status === 'DRAFT') throw new ApiError(400, 'Only an approved payroll run can have a statutory remittance recorded');

    const existing = await tenantScoped(StatutoryRemittance, schoolId).findOne({
      where: { payrollRunId, type }, transaction,
    });
    if (existing) throw new ApiError(400, `A ${type} remittance has already been recorded for this payroll run`);

    const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(cashAccountId, { transaction });
    if (!cashAccount) throw new ApiError(400, 'cashAccountId does not refer to a valid cash account');

    const entry = await postJournalEntry(schoolId, {
      entryDate: remittanceDate,
      description: description || `${type} remittance`,
      sourceType: 'STATUTORY_REMITTANCE',
      sourceId: payrollRunId,
      userId,
      lines: [
        { accountCode, debitPesewas: amountPesewas },
        { accountId: cashAccount.accountId, creditPesewas: amountPesewas },
      ],
    }, transaction);

    return tenantScoped(StatutoryRemittance, schoolId).create({
      payrollRunId,
      type,
      amountPesewas,
      remittanceDate,
      cashAccountId,
      description: description || null,
      journalEntryId: entry.id,
      createdByUserId: userId,
    }, { transaction });
  });
}

async function listStatutoryRemittancesForRun(schoolId, payrollRunId) {
  return tenantScoped(StatutoryRemittance, schoolId).findAll({
    where: { payrollRunId },
    order: [['createdAt', 'ASC']],
  });
}

async function getPayslip(schoolId, payslipId) {
  const payslip = await tenantScoped(Payslip, schoolId).findByPk(payslipId, {
    include: [Staff, { model: PayrollRun }],
  });
  if (!payslip) throw new ApiError(404, 'Payslip not found');
  return payslip;
}

// Manual re-send — same delivery path as the automatic email fired by
// payPayrollRun, just for one payslip on demand (e.g. staff lost the
// original, or their email was fixed after the run was paid).
async function emailPayslip(schoolId, payslipId) {
  const payslip = await getPayslip(schoolId, payslipId);
  if (!payslip.Staff?.email) throw new ApiError(400, 'This staff member has no email address on file');

  const school = await School.findByPk(schoolId);
  return notifyPayslips(schoolId, { school, payrollRun: payslip.PayrollRun, payslips: [payslip] });
}

// Bulk re-send for an entire run — same use case as emailPayslip but for
// "resend everyone's payslip" in one click (e.g. the automatic send at pay
// time partly failed, or staff emails were fixed up afterwards).
async function emailPayrollRunPayslips(schoolId, payrollRunId) {
  const run = await getPayrollRun(schoolId, payrollRunId);
  const school = await School.findByPk(schoolId);
  return notifyPayslips(schoolId, { school, payrollRun: run, payslips: run.payslips });
}

// ---- Self-service: a logged-in user viewing their own payslips ----
// Not role-gated (see routes.js) — any authenticated staff member, whatever
// their role, can be linked to a Staff row via Staff.userId and should see
// their own pay history. Mirrors parentPortal/service.js's
// getParentForUser/assertParentOwnsStudent pattern.

async function getStaffForUser(schoolId, userId) {
  return tenantScoped(Staff, schoolId).findOne({ where: { userId } });
}

async function listMyPayslips(schoolId, userId) {
  const staff = await getStaffForUser(schoolId, userId);
  if (!staff) return [];
  return tenantScoped(Payslip, schoolId).findAll({
    where: { staffId: staff.id },
    include: [Staff, { model: PayrollRun }],
    order: [[{ model: PayrollRun }, 'payPeriodStart', 'DESC']],
  });
}

async function getMyPayslip(schoolId, userId, payslipId) {
  const staff = await getStaffForUser(schoolId, userId);
  if (!staff) throw new ApiError(404, 'No staff record is linked to your account');

  const payslip = await tenantScoped(Payslip, schoolId).findByPk(payslipId, {
    include: [Staff, { model: PayrollRun }],
  });
  if (!payslip || payslip.staffId !== staff.id) throw new ApiError(404, 'Payslip not found');
  return payslip;
}

// ---- Statutory settings (read-only view of where SSNIT/PAYE are configured) ----
// SSNIT rates are simple enough to live as named constants (utils/ghanaPaye.js);
// PAYE bands are platform-level seeded data (paye_tax_bands table, NOT
// schoolId-scoped — GRA bands are national). This just surfaces both so an
// accountant can see what a payroll run actually used, without making them
// editable here (a rate change ships as a new seeder row/constant update,
// not a per-tenant UI edit — see the seeders/ comment).
async function getStatutorySettings() {
  const bands = await PayeTaxBand.findAll({ order: [['effectiveFrom', 'DESC'], ['bandOrder', 'ASC']] });
  const latestEffectiveFrom = bands[0]?.effectiveFrom || null;

  const ssnitRates = await SsnitRate.findAll({ order: [['effectiveFrom', 'DESC']] });
  const currentSsnit = ssnitRates[0];

  return {
    ssnit: {
      employeeRatePercent: currentSsnit ? Number(currentSsnit.employeeRatePercent) : 0,
      employerRatePercent: currentSsnit ? Number(currentSsnit.employerRatePercent) : 0,
      effectiveFrom: currentSsnit?.effectiveFrom || null,
    },
    payeTaxBands: bands.map((b) => ({
      id: b.id,
      effectiveFrom: b.effectiveFrom,
      bandOrder: b.bandOrder,
      upToPesewas: b.upToPesewas,
      ratePercent: Number(b.ratePercent),
      isActive: b.effectiveFrom === latestEffectiveFrom,
    })),
  };
}

// ---- Analytics ----
// One data point per payroll run (a run is naturally one pay period, so
// there's no separate "trend granularity" choice to make the way daily
// expense analytics has to bucket individual transactions) — trend/summary
// figures come straight off each run's already-computed totals; only the
// by-position/by-staff-type breakdown (and the basic/allowances split below)
// needs to walk every payslip.
//
// runIds (optional): an explicit set of payroll runs to scope to — lets a
// caller pick specific periods (e.g. "July 2026" and "September 2026", skip
// August) rather than only a contiguous date range. Takes precedence over
// from/to when present.
async function getPayrollAnalytics(schoolId, {
  from, to, runIds,
} = {}) {
  // Draft runs are provisional (nothing posted to the GL yet, totals can
  // still change before approval) — analytics only counts what actually
  // happened, same cutoff recordStatutoryRemittance uses.
  const where = { status: { [Op.ne]: 'DRAFT' } };
  if (Array.isArray(runIds) && runIds.length) {
    where.id = runIds;
  } else {
    if (from) where.payPeriodStart = { [Op.gte]: from };
    if (to) where.payPeriodEnd = { [Op.lte]: to };
  }

  const runs = await tenantScoped(PayrollRun, schoolId).findAll({
    where,
    include: [{ model: Payslip, as: 'payslips', include: [Staff] }],
    order: [['payPeriodStart', 'ASC']],
  });

  const trend = runs.map((run) => {
    const totalBasicPesewas = run.payslips.reduce((sum, p) => {
      const breakdown = JSON.parse(p.breakdownJson);
      return sum + (breakdown.basicSalaryPesewas || 0);
    }, 0);
    return {
      payrollRunId: run.id,
      payPeriodLabel: run.payPeriodLabel,
      payPeriodStart: run.payPeriodStart,
      payPeriodEnd: run.payPeriodEnd,
      status: run.status,
      headcount: run.payslips.length,
      grossPesewas: run.totalGrossPesewas,
      netPesewas: run.totalNetPesewas,
      payePesewas: run.totalPayePesewas,
      ssnitEmployeePesewas: run.totalSsnitEmployeePesewas,
      ssnitEmployerPesewas: run.totalSsnitEmployerPesewas,
      otherDeductionsPesewas: run.totalOtherDeductionsPesewas,
      employerCostPesewas: run.totalGrossPesewas + run.totalSsnitEmployerPesewas,
      totalBasicPesewas,
      // Everything above basic — allowances, taxable or not.
      totalAllowancesPesewas: run.totalGrossPesewas - totalBasicPesewas,
    };
  });

  const totals = trend.reduce((acc, t) => ({
    grossPesewas: acc.grossPesewas + t.grossPesewas,
    netPesewas: acc.netPesewas + t.netPesewas,
    payePesewas: acc.payePesewas + t.payePesewas,
    ssnitEmployeePesewas: acc.ssnitEmployeePesewas + t.ssnitEmployeePesewas,
    ssnitEmployerPesewas: acc.ssnitEmployerPesewas + t.ssnitEmployerPesewas,
    otherDeductionsPesewas: acc.otherDeductionsPesewas + t.otherDeductionsPesewas,
    employerCostPesewas: acc.employerCostPesewas + t.employerCostPesewas,
    totalBasicPesewas: acc.totalBasicPesewas + t.totalBasicPesewas,
    totalAllowancesPesewas: acc.totalAllowancesPesewas + t.totalAllowancesPesewas,
  }), {
    grossPesewas: 0,
    netPesewas: 0,
    payePesewas: 0,
    ssnitEmployeePesewas: 0,
    ssnitEmployerPesewas: 0,
    otherDeductionsPesewas: 0,
    employerCostPesewas: 0,
    totalBasicPesewas: 0,
    totalAllowancesPesewas: 0,
  });

  const latest = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  const momGrossChangePercent = latest && previous && previous.grossPesewas > 0
    ? Math.round(((latest.grossPesewas - previous.grossPesewas) / previous.grossPesewas) * 1000) / 10
    : null;

  const byPositionMap = new Map();
  const byStaffTypeMap = new Map();
  for (const run of runs) {
    for (const p of run.payslips) {
      const staff = p.Staff;
      if (!staff) continue;

      const posEntry = byPositionMap.get(staff.position) || {
        position: staff.position, count: 0, totalGrossPesewas: 0, totalNetPesewas: 0,
      };
      posEntry.count += 1;
      posEntry.totalGrossPesewas += p.grossPesewas;
      posEntry.totalNetPesewas += p.netPesewas;
      byPositionMap.set(staff.position, posEntry);

      const typeEntry = byStaffTypeMap.get(staff.staffType) || {
        staffType: staff.staffType, count: 0, totalGrossPesewas: 0,
      };
      typeEntry.count += 1;
      typeEntry.totalGrossPesewas += p.grossPesewas;
      byStaffTypeMap.set(staff.staffType, typeEntry);
    }
  }

  return {
    scope: {
      from: from || null,
      to: to || null,
      runIds: Array.isArray(runIds) && runIds.length ? runIds : null,
    },
    summary: {
      totalRuns: runs.length,
      ...totals,
      averageGrossPerRunPesewas: runs.length ? Math.round(totals.grossPesewas / runs.length) : 0,
      averageHeadcountPerRun: runs.length ? Math.round(trend.reduce((s, t) => s + t.headcount, 0) / runs.length) : 0,
      averageNetPerStaffPesewas: (() => {
        const totalHeadcount = trend.reduce((s, t) => s + t.headcount, 0);
        return totalHeadcount ? Math.round(totals.netPesewas / totalHeadcount) : 0;
      })(),
      effectivePayeRatePercent: totals.grossPesewas
        ? Math.round((totals.payePesewas / totals.grossPesewas) * 1000) / 10
        : 0,
      latestHeadcount: latest ? latest.headcount : 0,
      momGrossChangePercent,
    },
    trend,
    byPosition: [...byPositionMap.values()].sort((a, b) => b.totalGrossPesewas - a.totalGrossPesewas),
    byStaffType: [...byStaffTypeMap.values()].sort((a, b) => b.totalGrossPesewas - a.totalGrossPesewas),
  };
}

module.exports = {
  getSalaryStructure,
  setSalaryStructure,
  listPayrollRuns,
  getPayrollRun,
  createPayrollRun,
  approvePayrollRun,
  payPayrollRun,
  recordStatutoryRemittance,
  listStatutoryRemittancesForRun,
  getPayslip,
  emailPayslip,
  emailPayrollRunPayslips,
  listMyPayslips,
  getMyPayslip,
  getStatutorySettings,
  getPayrollAnalytics,
};
