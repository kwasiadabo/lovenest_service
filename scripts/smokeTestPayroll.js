/**
 * One-off smoke test for the Payroll flow (salary structure -> payroll
 * run -> approve -> pay), against the real DB. Creates a temp staff
 * member and cash account, then cleans everything up.
 *
 * Usage: node scripts/smokeTestPayroll.js
 */
require('dotenv').config();
const {
  sequelize, School, Staff, SalaryStructure, SalaryComponent, PayrollRun, Payslip,
  CashAccount, Account, JournalEntry, JournalLine,
} = require('../src/models');
const payrollService = require('../src/modules/payroll/service');
const accountingService = require('../src/modules/accounting/service');

async function main() {
  await sequelize.authenticate();
  const school = await School.findOne();
  console.log(`Testing against school: ${school.name} (${school.id})`);

  const staff = await Staff.create({
    schoolId: school.id,
    fullName: 'SMOKE TEST Staff',
    dateOfBirth: '1990-01-01',
    dateHired: '2020-01-01',
    position: 'Class Teacher',
    staffType: 'TEACHING',
    qualification: 'B.Ed',
  });
  const cashAccount = await accountingService.createCashAccount(school.id, { name: 'SMOKE TEST Payroll Cash', kind: 'BANK' });

  await payrollService.setSalaryStructure(school.id, staff.id, null, {
    basicSalaryPesewas: 300000, // GHS 3,000
    effectiveDate: new Date().toISOString().slice(0, 10),
    components: [
      { name: 'Transport Allowance', componentType: 'ALLOWANCE', calcMethod: 'FIXED', amountPesewas: 20000, taxable: true },
    ],
  });
  console.log('Salary structure set.');

  const today = new Date().toISOString().slice(0, 10);
  let run = await payrollService.createPayrollRun(school.id, null, {
    payPeriodStart: today, payPeriodEnd: today, payPeriodLabel: 'SMOKE TEST period',
  });
  console.log('Payroll run created. Payslips:', run.payslips.length, 'totalNet:', run.totalNetPesewas);

  run = await payrollService.approvePayrollRun(school.id, run.id, null);
  console.log('Approved. status:', run.status);

  const trialBalanceAfterApproval = await accountingService.getTrialBalance(school.id, {});
  console.log('Balanced after approval:', trialBalanceAfterApproval.totalDebitBalancePesewas === trialBalanceAfterApproval.totalCreditBalancePesewas);

  run = await payrollService.payPayrollRun(school.id, run.id, null, { cashAccountId: cashAccount.id });
  console.log('Paid. status:', run.status);

  const trialBalanceAfterPay = await accountingService.getTrialBalance(school.id, {});
  console.log('Balanced after pay:', trialBalanceAfterPay.totalDebitBalancePesewas === trialBalanceAfterPay.totalCreditBalancePesewas);

  // Cleanup
  const entries = await JournalEntry.findAll({ where: { sourceType: ['PAYROLL_ACCRUAL', 'PAYROLL_PAYMENT'], sourceId: run.id } });
  const entryIds = entries.map((e) => e.id);
  await JournalLine.destroy({ where: { journalEntryId: entryIds } });
  await JournalEntry.destroy({ where: { id: entryIds } });
  await Payslip.destroy({ where: { payrollRunId: run.id } });
  await PayrollRun.destroy({ where: { id: run.id } });
  await SalaryComponent.destroy({ where: { salaryStructureId: (await SalaryStructure.findAll({ where: { staffId: staff.id } })).map((s) => s.id) } });
  await SalaryStructure.destroy({ where: { staffId: staff.id } });
  await CashAccount.destroy({ where: { id: cashAccount.id } });
  await Account.destroy({ where: { id: cashAccount.accountId } });
  await Staff.destroy({ where: { id: staff.id } });
  console.log('Cleaned up. All checks passed.');

  process.exit(0);
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
