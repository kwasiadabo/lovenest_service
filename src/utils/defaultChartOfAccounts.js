// Every school starts with this Chart of Accounts. Codes/names an admin can
// rename or add to freely, but isSystemAccount rows are auto-posting
// targets hardcoded by code in accounting/ledgerPoster.js and its callers —
// they can be deactivated once unused, never deleted or renumbered.
//
// 4000-4040 map 1:1 to FeeType.CATEGORIES (ADMISSION/TERM/BOOKS/UNIFORM/
// OTHER); 5100-5190 map 1:1 to ExpenseItem.CATEGORIES (UTILITIES/SUPPLIES/
// MAINTENANCE/TRANSPORT/SALARIES/OTHER). 5140 "Salaries (Manual/Ad hoc)"
// stays mapped to ExpenseItem.category='SALARIES' for backward
// compatibility, but is deliberately a different account from 5000
// "Salaries & Wages", which only the Payroll module posts to — this avoids
// conflating ad hoc manually-recorded staff payments with a structured
// payroll run.
//
// Cash/bank/mobile-money accounts are NOT seeded here — each CashAccount an
// admin creates auto-provisions its own 1010, 1020, ... account code (see
// accounting/service.js#createCashAccount).
const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Petty Cash', type: 'ASSET', normalBalance: 'DEBIT', isCashAccount: true },
  { code: '1100', name: 'Accounts Receivable - Student Fees', type: 'ASSET', normalBalance: 'DEBIT', isSystemAccount: true },
  { code: '1200', name: 'Prepaid Expenses', type: 'ASSET', normalBalance: 'DEBIT' },

  { code: '1500', name: 'Fixed Assets - Land', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1505', name: 'Fixed Assets - Buildings', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1510', name: 'Fixed Assets - Furniture & Fittings', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1520', name: 'Fixed Assets - Office Equipment', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1530', name: 'Fixed Assets - ICT Equipment', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1540', name: 'Fixed Assets - Motor Vehicles', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1590', name: 'Fixed Assets - Other', type: 'ASSET', normalBalance: 'DEBIT' },

  { code: '1605', name: 'Accumulated Depreciation - Buildings', type: 'ASSET', normalBalance: 'CREDIT', isContra: true },
  { code: '1610', name: 'Accumulated Depreciation - Furniture & Fittings', type: 'ASSET', normalBalance: 'CREDIT', isContra: true },
  { code: '1620', name: 'Accumulated Depreciation - Office Equipment', type: 'ASSET', normalBalance: 'CREDIT', isContra: true },
  { code: '1630', name: 'Accumulated Depreciation - ICT Equipment', type: 'ASSET', normalBalance: 'CREDIT', isContra: true },
  { code: '1640', name: 'Accumulated Depreciation - Motor Vehicles', type: 'ASSET', normalBalance: 'CREDIT', isContra: true },
  { code: '1690', name: 'Accumulated Depreciation - Other', type: 'ASSET', normalBalance: 'CREDIT', isContra: true },

  { code: '2000', name: 'Accounts Payable - Expenses', type: 'LIABILITY', normalBalance: 'CREDIT', isSystemAccount: true },
  { code: '2010', name: 'PAYE Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT', isSystemAccount: true },
  { code: '2020', name: 'SSNIT Contributions Payable', type: 'LIABILITY', normalBalance: 'CREDIT', isSystemAccount: true },
  { code: '2030', name: 'Net Salaries Payable', type: 'LIABILITY', normalBalance: 'CREDIT', isSystemAccount: true },
  { code: '2040', name: 'Other Payroll Deductions Payable', type: 'LIABILITY', normalBalance: 'CREDIT', isSystemAccount: true },
  { code: '2500', name: 'Loans Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '2900', name: 'Suspense Account', type: 'LIABILITY', normalBalance: 'CREDIT', isSystemAccount: true },

  { code: '3000', name: 'Retained Earnings / Accumulated Surplus', type: 'EQUITY', normalBalance: 'CREDIT', isSystemAccount: true },
  { code: '3010', name: 'Opening Balance Equity', type: 'EQUITY', normalBalance: 'CREDIT', isSystemAccount: true },

  { code: '4000', name: 'Tuition & Fees Income', type: 'INCOME', normalBalance: 'CREDIT', isSystemAccount: true }, // FeeType.category = TERM
  { code: '4010', name: 'Admission Fees Income', type: 'INCOME', normalBalance: 'CREDIT', isSystemAccount: true }, // ADMISSION
  { code: '4020', name: 'Books & Materials Income', type: 'INCOME', normalBalance: 'CREDIT', isSystemAccount: true }, // BOOKS
  { code: '4030', name: 'Uniform Income', type: 'INCOME', normalBalance: 'CREDIT', isSystemAccount: true }, // UNIFORM
  { code: '4040', name: 'Other Fees Income', type: 'INCOME', normalBalance: 'CREDIT', isSystemAccount: true }, // OTHER
  { code: '4050', name: 'Levy Income', type: 'INCOME', normalBalance: 'CREDIT', isSystemAccount: true },
  { code: '4060', name: 'Transport Fees Income', type: 'INCOME', normalBalance: 'CREDIT', isSystemAccount: true },
  { code: '4090', name: 'Discounts & Waivers', type: 'INCOME', normalBalance: 'DEBIT', isContra: true, isSystemAccount: true },
  { code: '4900', name: 'Other Income', type: 'INCOME', normalBalance: 'CREDIT' },

  { code: '5000', name: 'Salaries & Wages', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true },
  { code: '5010', name: 'Staff Allowances', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true },
  { code: '5020', name: 'SSNIT Contributions - Employer', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true },

  { code: '5100', name: 'Utilities', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true }, // ExpenseItem.category = UTILITIES
  { code: '5110', name: 'Supplies', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true }, // SUPPLIES
  { code: '5120', name: 'Repairs & Maintenance', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true }, // MAINTENANCE
  { code: '5130', name: 'Transport', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true }, // TRANSPORT
  { code: '5140', name: 'Salaries (Manual/Ad hoc)', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true }, // SALARIES
  { code: '5190', name: 'Other Expenses', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true }, // OTHER

  { code: '5400', name: 'Depreciation Expense', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true },
  { code: '5500', name: 'Bank Charges & Fees', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5900', name: 'Loss on Disposal of Fixed Assets', type: 'EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true },
];

// Maps FeeType.category -> income account code, and ExpenseItem.category ->
// expense account code, so the ledger poster never hardcodes this twice.
const FEE_CATEGORY_ACCOUNT_CODES = {
  TERM: '4000',
  ADMISSION: '4010',
  BOOKS: '4020',
  UNIFORM: '4030',
  OTHER: '4040',
};

const EXPENSE_CATEGORY_ACCOUNT_CODES = {
  UTILITIES: '5100',
  SUPPLIES: '5110',
  MAINTENANCE: '5120',
  TRANSPORT: '5130',
  SALARIES: '5140',
  OTHER: '5190',
};

// Maps FixedAsset.category -> { assetAccountCode, accumulatedDepreciationAccountCode }.
// LAND has no accumulated depreciation account — land is never depreciated.
const FIXED_ASSET_CATEGORY_ACCOUNT_CODES = {
  LAND: { assetAccountCode: '1500', accumulatedDepreciationAccountCode: null },
  BUILDING: { assetAccountCode: '1505', accumulatedDepreciationAccountCode: '1605' },
  FURNITURE_FIXTURES: { assetAccountCode: '1510', accumulatedDepreciationAccountCode: '1610' },
  OFFICE_EQUIPMENT: { assetAccountCode: '1520', accumulatedDepreciationAccountCode: '1620' },
  ICT_EQUIPMENT: { assetAccountCode: '1530', accumulatedDepreciationAccountCode: '1630' },
  MOTOR_VEHICLE: { assetAccountCode: '1540', accumulatedDepreciationAccountCode: '1640' },
  OTHER: { assetAccountCode: '1590', accumulatedDepreciationAccountCode: '1690' },
};

async function seedDefaultChartOfAccounts(Account, schoolId, transaction) {
  await Account.bulkCreate(
    DEFAULT_ACCOUNTS.map((account) => ({ schoolId, ...account })),
    { transaction },
  );
}

module.exports = {
  DEFAULT_ACCOUNTS,
  FEE_CATEGORY_ACCOUNT_CODES,
  EXPENSE_CATEGORY_ACCOUNT_CODES,
  FIXED_ASSET_CATEGORY_ACCOUNT_CODES,
  seedDefaultChartOfAccounts,
};
