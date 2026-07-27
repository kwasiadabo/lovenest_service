const express = require('express');
const controller = require('./controller');
const {
  validateCreateAccount, validateCreateCashAccount, validateCashTransfer,
  validateBankTransaction, validateVoidBankTransaction, validateStartReconciliation,
  validateJournalEntry, validateJournalEntryUpdate,
} = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// Read access to statements/reports mirrors financials' billingRoles.
const readRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT', 'HEAD_TEACHER');
// Chart of Accounts / cash transfers / cash-account creation are
// bookkeeping-setup actions, same tier as Fee Types/Expense Items.
const bookkeepingRoles = requireRole('SCHOOL_ADMIN', 'ACCOUNTANT');
// Manual journal entries and cash-account setup mutate the books directly
// with no secondary business object backing them — the most sensitive
// writes in the subsystem, so SCHOOL_ADMIN only.
const ledgerAdminRoles = requireRole('SCHOOL_ADMIN');

router.get('/accounts', readRoles, controller.listAccounts);
router.post('/accounts', bookkeepingRoles, validateCreateAccount, controller.createAccount);
router.patch('/accounts/:id', bookkeepingRoles, controller.updateAccount);

router.get('/cash-accounts', readRoles, controller.listCashAccounts);
router.post('/cash-accounts', ledgerAdminRoles, validateCreateCashAccount, controller.createCashAccount);
router.patch('/cash-accounts/:id', ledgerAdminRoles, controller.updateCashAccount);
router.get('/cash-accounts/:id/statement', readRoles, controller.getCashAccountStatement);

router.get('/cash-transfers', readRoles, controller.listCashTransfers);
router.post('/cash-transfers', bookkeepingRoles, validateCashTransfer, controller.createCashTransfer);

router.get('/bank-transactions', readRoles, controller.listBankTransactions);
router.post('/bank-transactions', bookkeepingRoles, validateBankTransaction, controller.createBankTransaction);
router.post('/bank-transactions/:id/void', ledgerAdminRoles, validateVoidBankTransaction, controller.voidBankTransaction);

router.get('/bank-reconciliations', readRoles, controller.listBankReconciliations);
router.post('/bank-reconciliations', bookkeepingRoles, validateStartReconciliation, controller.startBankReconciliation);
router.get('/bank-reconciliations/:id', readRoles, controller.getBankReconciliationWorksheet);
router.patch('/bank-reconciliations/:id/cleared-lines', bookkeepingRoles, controller.setBankReconciliationClearedLines);
router.post('/bank-reconciliations/:id/complete', bookkeepingRoles, controller.completeBankReconciliation);
router.delete('/bank-reconciliations/:id', bookkeepingRoles, controller.cancelBankReconciliation);
router.get('/bank-reconciliations/:id/report', readRoles, controller.getBankReconciliationReport);

router.get('/journal-entries', readRoles, controller.listJournalEntries);
router.post('/journal-entries', ledgerAdminRoles, validateJournalEntry, controller.createJournalEntry);
router.get('/journal-entries/:id', readRoles, controller.getJournalEntry);
router.patch('/journal-entries/:id', ledgerAdminRoles, validateJournalEntryUpdate, controller.updateJournalEntry);

router.get('/accounting/general-ledger/:accountId', readRoles, controller.getGeneralLedger);
router.get('/accounting/trial-balance', readRoles, controller.getTrialBalance);
router.get('/accounting/income-statement', readRoles, controller.getIncomeStatement);
router.get('/accounting/balance-sheet', readRoles, controller.getBalanceSheet);
router.get('/accounting/cash-flow-statement', readRoles, controller.getCashFlowStatement);
router.get('/accounting/ap-aging', readRoles, controller.getApAging);
router.get('/accounting/reversals-report', readRoles, controller.getReversalsReport);
router.post('/accounting/academic-years/:id/close', ledgerAdminRoles, controller.closeAcademicYear);

module.exports = router;
