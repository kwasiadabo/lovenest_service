const accountingService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listAccounts = wrap(async (req, res) => {
  const { type, isActive } = req.query;
  res.json(await accountingService.listAccounts(req.schoolId, {
    type, isActive: isActive === undefined ? undefined : isActive === 'true',
  }));
});

const createAccount = wrap(async (req, res) => {
  res.status(201).json(await accountingService.createAccount(req.schoolId, req.body));
});

const updateAccount = wrap(async (req, res) => {
  res.json(await accountingService.updateAccount(req.schoolId, req.params.id, req.body));
});

const listCashAccounts = wrap(async (req, res) => {
  const { isActive } = req.query;
  res.json(await accountingService.listCashAccounts(req.schoolId, {
    isActive: isActive === undefined ? undefined : isActive === 'true',
  }));
});

const createCashAccount = wrap(async (req, res) => {
  res.status(201).json(await accountingService.createCashAccount(req.schoolId, req.body));
});

const updateCashAccount = wrap(async (req, res) => {
  res.json(await accountingService.updateCashAccount(req.schoolId, req.params.id, req.body));
});

const getCashAccountStatement = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await accountingService.getCashAccountStatement(req.schoolId, req.params.id, { from, to }));
});

const createCashTransfer = wrap(async (req, res) => {
  res.status(201).json(await accountingService.createCashTransfer(req.schoolId, req.auth.userId, req.body));
});

const listCashTransfers = wrap(async (req, res) => {
  res.json(await accountingService.listCashTransfers(req.schoolId));
});

const listBankTransactions = wrap(async (req, res) => {
  const {
    cashAccountId, type, from, to,
  } = req.query;
  res.json(await accountingService.listBankTransactions(req.schoolId, {
    cashAccountId, type, from, to,
  }));
});

const createBankTransaction = wrap(async (req, res) => {
  res.status(201).json(await accountingService.createBankTransaction(req.schoolId, req.auth.userId, req.body));
});

const voidBankTransaction = wrap(async (req, res) => {
  res.json(await accountingService.voidBankTransaction(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const listBankReconciliations = wrap(async (req, res) => {
  res.json(await accountingService.listBankReconciliations(req.schoolId, { cashAccountId: req.query.cashAccountId }));
});

const startBankReconciliation = wrap(async (req, res) => {
  res.status(201).json(await accountingService.startBankReconciliation(req.schoolId, req.auth.userId, req.body));
});

const getBankReconciliationWorksheet = wrap(async (req, res) => {
  res.json(await accountingService.getBankReconciliationWorksheet(req.schoolId, req.params.id));
});

const setBankReconciliationClearedLines = wrap(async (req, res) => {
  res.json(await accountingService.setBankReconciliationClearedLines(
    req.schoolId, req.params.id, req.body.journalLineIds || [],
  ));
});

const completeBankReconciliation = wrap(async (req, res) => {
  res.json(await accountingService.completeBankReconciliation(req.schoolId, req.params.id, req.auth.userId));
});

const cancelBankReconciliation = wrap(async (req, res) => {
  await accountingService.cancelBankReconciliation(req.schoolId, req.params.id);
  res.status(204).send();
});

const getBankReconciliationReport = wrap(async (req, res) => {
  res.json(await accountingService.getBankReconciliationReport(req.schoolId, req.params.id));
});

const createJournalEntry = wrap(async (req, res) => {
  res.status(201).json(await accountingService.createManualJournalEntry(req.schoolId, req.auth.userId, req.body));
});

const updateJournalEntry = wrap(async (req, res) => {
  res.json(await accountingService.updateManualJournalEntry(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const listJournalEntries = wrap(async (req, res) => {
  const {
    from, to, sourceType, accountId, page, pageSize,
  } = req.query;
  res.json(await accountingService.listJournalEntries(req.schoolId, {
    from,
    to,
    sourceType,
    accountId,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  }));
});

const getJournalEntry = wrap(async (req, res) => {
  res.json(await accountingService.getJournalEntry(req.schoolId, req.params.id));
});

const getReversalsReport = wrap(async (req, res) => {
  const {
    from, to, sourceType, userId,
  } = req.query;
  res.json(await accountingService.getReversalsReport(req.schoolId, {
    from, to, sourceType, userId,
  }));
});

const getGeneralLedger = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await accountingService.getGeneralLedger(req.schoolId, req.params.accountId, { from, to }));
});

const getTrialBalance = wrap(async (req, res) => {
  res.json(await accountingService.getTrialBalance(req.schoolId, { asOf: req.query.asOf }));
});

const getIncomeStatement = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await accountingService.getIncomeStatement(req.schoolId, { from, to }));
});

const getBalanceSheet = wrap(async (req, res) => {
  res.json(await accountingService.getBalanceSheet(req.schoolId, { asOf: req.query.asOf }));
});

const getCashFlowStatement = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await accountingService.getCashFlowStatement(req.schoolId, { from, to }));
});

const getApAging = wrap(async (req, res) => {
  res.json(await accountingService.getApAging(req.schoolId));
});

const closeAcademicYear = wrap(async (req, res) => {
  res.status(201).json(await accountingService.closeAcademicYear(req.schoolId, req.params.id, req.auth.userId));
});

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  listCashAccounts,
  createCashAccount,
  updateCashAccount,
  getCashAccountStatement,
  createCashTransfer,
  listCashTransfers,
  listBankTransactions,
  createBankTransaction,
  voidBankTransaction,
  listBankReconciliations,
  startBankReconciliation,
  getBankReconciliationWorksheet,
  setBankReconciliationClearedLines,
  completeBankReconciliation,
  cancelBankReconciliation,
  getBankReconciliationReport,
  createJournalEntry,
  updateJournalEntry,
  listJournalEntries,
  getJournalEntry,
  getReversalsReport,
  getGeneralLedger,
  getTrialBalance,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlowStatement,
  getApAging,
  closeAcademicYear,
};
