/**
 * One-time hydration of realistic accounting data for Westhatch School
 * (the populated demo school — 154 students, 12 staff) so the new
 * accounting subsystem has representative data to demo/explore instead of
 * just the bare opening-balance backfill entry.
 *
 * Seeds, in order: named cash/bank accounts, a salary structure for every
 * existing staff member, one payroll run (drafted/approved/paid), four
 * typical fixed assets (paid from the new main bank account) with one
 * depreciation run, and an approved budget for the current academic year.
 *
 * Idempotent per section: skips anything that looks already-seeded (by
 * name) so re-running doesn't create duplicates.
 *
 * Usage: node scripts/hydrateWesthatchAccounting.js
 */
require('dotenv').config();
const {
  sequelize, School, User, Staff, AcademicYear, Account, CashAccount,
} = require('../src/models');
const accountingService = require('../src/modules/accounting/service');
const payrollService = require('../src/modules/payroll/service');
const fixedAssetsService = require('../src/modules/fixedAssets/service');
const budgetingService = require('../src/modules/budgeting/service');

// Targeted by exact id, not name — SQL Server's default case-insensitive
// collation means `name = 'Westhatch School'` also matches the *other*,
// unrelated empty "WestHatch School" row, and findOne would silently
// return whichever one sorts first.
const SCHOOL_ID = 'e4e9b7bc-c33d-49fa-9c0f-3e807a1412c5';

const POSITION_BASIC_SALARY_PESEWAS = {
  Headteacher: 450000,
  'Assistant Headteacher': 380000,
  'Class Teacher': 280000,
  'Subject Teacher': 260000,
};

const FIXED_ASSETS_TO_SEED = [
  {
    name: 'School Building', category: 'BUILDING', acquisitionDate: '2020-01-15',
    costPesewas: 50000000, residualValuePesewas: 5000000, usefulLifeMonths: 480,
  },
  {
    name: 'Classroom Furniture', category: 'FURNITURE_FIXTURES', acquisitionDate: '2023-08-01',
    costPesewas: 2500000, residualValuePesewas: 0, usefulLifeMonths: 84,
  },
  {
    name: 'Computer Lab Equipment', category: 'ICT_EQUIPMENT', acquisitionDate: '2024-09-01',
    costPesewas: 3500000, residualValuePesewas: 0, usefulLifeMonths: 36,
  },
  {
    name: 'School Bus', category: 'MOTOR_VEHICLE', acquisitionDate: '2022-03-10',
    costPesewas: 18000000, residualValuePesewas: 2000000, usefulLifeMonths: 96,
  },
];

const BUDGET_LINES = [
  { accountCode: '4000', budgetedAmountPesewas: 80000000 }, // Tuition & Fees Income GHS 800,000
  { accountCode: '4050', budgetedAmountPesewas: 5000000 }, // Levy Income GHS 50,000
  { accountCode: '5000', budgetedAmountPesewas: 40000000 }, // Salaries & Wages GHS 400,000
  { accountCode: '5100', budgetedAmountPesewas: 6000000 }, // Utilities GHS 60,000
  { accountCode: '5110', budgetedAmountPesewas: 4000000 }, // Supplies GHS 40,000
  { accountCode: '5120', budgetedAmountPesewas: 3000000 }, // Repairs & Maintenance GHS 30,000
  { accountCode: '5130', budgetedAmountPesewas: 2000000 }, // Transport GHS 20,000
];

async function seedCashAccounts(schoolId) {
  const toCreate = [
    { name: 'GCB Main Account', kind: 'BANK', bankName: 'GCB Bank', accountNumber: '1021456789', openingBalancePesewas: 2000000 },
    { name: 'MTN Mobile Money', kind: 'MOBILE_MONEY', openingBalancePesewas: 200000 },
    { name: 'Petty Cash', kind: 'CASH', openingBalancePesewas: 50000 },
  ];
  const created = {};
  for (const spec of toCreate) {
    // eslint-disable-next-line no-await-in-loop
    let account = await CashAccount.findOne({ where: { schoolId, name: spec.name } });
    if (!account) {
      // eslint-disable-next-line no-await-in-loop
      account = await accountingService.createCashAccount(schoolId, spec);
      console.log(`Created cash account: ${spec.name}`);
    } else {
      console.log(`Cash account already exists, skipping: ${spec.name}`);
    }
    created[spec.name] = account;
  }
  return created;
}

async function seedSalaryStructures(schoolId, userId) {
  const staffList = await Staff.findAll({ where: { schoolId } });
  for (const staff of staffList) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await payrollService.getSalaryStructure(schoolId, staff.id);
    if (existing) {
      console.log(`Salary structure already exists, skipping: ${staff.fullName}`);
      continue;
    }
    const basicSalaryPesewas = POSITION_BASIC_SALARY_PESEWAS[staff.position] || 250000;
    // eslint-disable-next-line no-await-in-loop
    await payrollService.setSalaryStructure(schoolId, staff.id, userId, {
      basicSalaryPesewas,
      effectiveDate: '2026-01-01',
      components: [
        {
          name: 'Transport Allowance', componentType: 'ALLOWANCE', calcMethod: 'FIXED', amountPesewas: 30000, taxable: true,
        },
      ],
    });
    console.log(`Set salary structure for ${staff.fullName} (${staff.position}): GHS ${basicSalaryPesewas / 100}/month`);
  }
}

async function seedPayrollRun(schoolId, userId, cashAccount) {
  const existing = (await payrollService.listPayrollRuns(schoolId))
    .find((r) => r.payPeriodLabel === 'June 2026');
  if (existing) {
    console.log('Payroll run for June 2026 already exists, skipping.');
    return;
  }

  let run = await payrollService.createPayrollRun(schoolId, userId, {
    payPeriodStart: '2026-06-01', payPeriodEnd: '2026-06-30', payPeriodLabel: 'June 2026',
  });
  console.log(`Created payroll run for June 2026 — ${run.payslips.length} payslips, net total GHS ${run.totalNetPesewas / 100}`);

  run = await payrollService.approvePayrollRun(schoolId, run.id, userId);
  console.log('Payroll run approved.');

  run = await payrollService.payPayrollRun(schoolId, run.id, userId, { cashAccountId: cashAccount.id });
  console.log('Payroll run paid from GCB Main Account.');
}

async function seedFixedAssets(schoolId, userId, cashAccount) {
  for (const spec of FIXED_ASSETS_TO_SEED) {
    // eslint-disable-next-line no-await-in-loop
    const existing = (await fixedAssetsService.listFixedAssets(schoolId)).find((a) => a.name === spec.name);
    if (existing) {
      console.log(`Fixed asset already exists, skipping: ${spec.name}`);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const asset = await fixedAssetsService.createFixedAsset(schoolId, userId, {
      ...spec, cashAccountId: cashAccount.id,
    });
    console.log(`Created fixed asset: ${asset.assetCode} — ${spec.name} (GHS ${spec.costPesewas / 100})`);
  }

  const result = await fixedAssetsService.runDepreciation(schoolId, userId, {
    periodLabel: '2026-06', periodStart: '2026-06-01', periodEnd: '2026-06-30',
  });
  console.log(`Depreciation run for 2026-06: ${result.entries.length} asset(s) depreciated.`);
}

async function seedBudget(schoolId, userId) {
  const currentYear = await AcademicYear.findOne({ where: { schoolId, isCurrent: true } });
  if (!currentYear) {
    console.log('No current academic year found — skipping budget.');
    return;
  }

  const existing = (await budgetingService.listBudgets(schoolId)).find((b) => b.name === `${currentYear.name} Budget`);
  if (existing) {
    console.log('Budget already exists, skipping.');
    return;
  }

  const accountByCode = {};
  for (const line of BUDGET_LINES) {
    // eslint-disable-next-line no-await-in-loop
    accountByCode[line.accountCode] = await Account.findOne({ where: { schoolId, code: line.accountCode } });
  }

  let budget = await budgetingService.createBudget(schoolId, userId, {
    academicYearId: currentYear.id,
    name: `${currentYear.name} Budget`,
    lines: BUDGET_LINES.map((line) => ({
      accountId: accountByCode[line.accountCode].id,
      budgetedAmountPesewas: line.budgetedAmountPesewas,
    })),
  });
  console.log(`Created budget "${budget.name}" with ${budget.lines.length} line(s).`);

  budget = await budgetingService.approveBudget(schoolId, budget.id, userId);
  console.log('Budget approved.');
}

async function main() {
  await sequelize.authenticate();
  const school = await School.findByPk(SCHOOL_ID);
  if (!school) throw new Error(`School ${SCHOOL_ID} not found`);
  console.log(`Hydrating accounting data for ${school.name} (${school.id})`);

  const admin = await User.findOne({ where: { schoolId: school.id, email: 'owkwasi@yahoo.com' } });
  const userId = admin ? admin.id : null;

  const cashAccounts = await seedCashAccounts(school.id);
  await seedSalaryStructures(school.id, userId);
  await seedPayrollRun(school.id, userId, cashAccounts['GCB Main Account']);
  await seedFixedAssets(school.id, userId, cashAccounts['GCB Main Account']);
  await seedBudget(school.id, userId);

  const tb = await accountingService.getTrialBalance(school.id, {});
  console.log(
    'Final trial balance — balanced:',
    tb.totalDebitBalancePesewas === tb.totalCreditBalancePesewas,
    `(Dr ${tb.totalDebitBalancePesewas} / Cr ${tb.totalCreditBalancePesewas})`,
  );

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
