const { Op } = require('sequelize');
const {
  sequelize, Account, JournalEntry, JournalLine, CashAccount, CashTransfer, User, ExpenseRequest, ExpenseItem,
  AcademicYear, BankTransaction, BankReconciliation,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const {
  postJournalEntry, reverseEntryById, reverseEntryFor, getActiveEntryFor,
} = require('./ledgerPoster');

const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

// ---- Chart of Accounts ----

async function listAccounts(schoolId, { type, isActive } = {}) {
  const where = {};
  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive;
  return tenantScoped(Account, schoolId).findAll({ where, order: [['code', 'ASC']] });
}

async function createAccount(schoolId, { code, name, type, normalBalance, parentAccountId, description }) {
  const existing = await tenantScoped(Account, schoolId).findOne({ where: { code } });
  if (existing) throw new ApiError(409, `Account code "${code}" is already in use`);
  return tenantScoped(Account, schoolId).create({
    code, name, type, normalBalance, parentAccountId: parentAccountId || null, description: description || null,
  });
}

async function updateAccount(schoolId, accountId, { name, description, isActive, parentAccountId }) {
  const account = await tenantScoped(Account, schoolId).findByPk(accountId);
  if (!account) throw new ApiError(404, 'Account not found');
  if (account.isSystemAccount && isActive === false) {
    const usedInLines = await tenantScoped(JournalLine, schoolId).count({ where: { accountId } });
    if (usedInLines > 0) {
      throw new ApiError(400, 'Cannot deactivate a system account that already has postings');
    }
  }
  await account.update({
    name: name !== undefined ? name : account.name,
    description: description !== undefined ? description : account.description,
    isActive: isActive !== undefined ? isActive : account.isActive,
    parentAccountId: parentAccountId !== undefined ? parentAccountId : account.parentAccountId,
  });
  return account;
}

// ---- Cash accounts ----

async function nextCashAccountCode(schoolId) {
  const rows = await tenantScoped(Account, schoolId).findAll({
    where: { code: { [Op.like]: '10%' }, isCashAccount: true },
    attributes: ['code'],
  });
  const maxSuffix = rows.reduce((max, row) => {
    const n = Number(row.code);
    return Number.isFinite(n) && n >= 1000 ? Math.max(max, n) : max;
  }, 1000);
  return String(maxSuffix + 10);
}

async function listCashAccounts(schoolId, { isActive } = {}) {
  const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  const cashAccounts = await tenantScoped(CashAccount, schoolId).findAll({
    where,
    include: [{ model: Account, as: 'account' }],
    order: [['name', 'ASC']],
  });
  const balances = await getAccountBalances(schoolId, cashAccounts.map((c) => c.accountId));
  return cashAccounts.map((c) => ({ ...c.toJSON(), balancePesewas: balances[c.accountId] || 0 }));
}

// Accepts an optional existing transaction so callers that need to create a
// cash account as one step of a larger atomic operation (e.g. pettyCash/
// service.js#setUpFund, which also creates a PettyCashFund row) can join it
// instead of committing this in isolation. Existing callers that don't pass
// one keep getting their own dedicated transaction, unchanged.
async function createCashAccount(schoolId, {
  name, kind, bankName, accountNumber, openingBalancePesewas,
}, existingTransaction) {
  const run = async (transaction) => {
    const code = await nextCashAccountCode(schoolId);
    const account = await tenantScoped(Account, schoolId).create({
      code,
      name: `Cash/Bank - ${name}`,
      type: 'ASSET',
      normalBalance: 'DEBIT',
      isCashAccount: true,
      isSystemAccount: true,
    }, { transaction });

    const cashAccount = await tenantScoped(CashAccount, schoolId).create({
      name,
      accountId: account.id,
      kind,
      bankName: bankName || null,
      accountNumber: accountNumber || null,
      openingBalancePesewas: openingBalancePesewas || 0,
    }, { transaction });

    if (openingBalancePesewas) {
      await postJournalEntry(schoolId, {
        entryDate: new Date().toISOString().slice(0, 10),
        description: `Opening balance for ${name}`,
        sourceType: 'OPENING_BALANCE',
        sourceId: cashAccount.id,
        lines: [
          { accountId: account.id, debitPesewas: openingBalancePesewas },
          { accountCode: '3010', creditPesewas: openingBalancePesewas },
        ],
      }, transaction);
    }

    return tenantScoped(CashAccount, schoolId).findByPk(cashAccount.id, {
      include: [{ model: Account, as: 'account' }],
      transaction,
    });
  };

  if (existingTransaction) return run(existingTransaction);
  return sequelize.transaction(run);
}

async function updateCashAccount(schoolId, cashAccountId, {
  name, bankName, accountNumber, isActive, isOnlineDefault,
}) {
  const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(cashAccountId);
  if (!cashAccount) throw new ApiError(404, 'Cash account not found');

  await sequelize.transaction(async (transaction) => {
    // Only one cash account can be the online-payments target at a time —
    // enforced here rather than in the DB (see models/cashaccount.js), so
    // flagging this one true always clears any other for the school first.
    if (isOnlineDefault === true) {
      await tenantScoped(CashAccount, schoolId).update(
        { isOnlineDefault: false },
        { where: { id: { [Op.ne]: cashAccountId } }, transaction },
      );
    }
    await cashAccount.update({
      name: name !== undefined ? name : cashAccount.name,
      bankName: bankName !== undefined ? bankName : cashAccount.bankName,
      accountNumber: accountNumber !== undefined ? accountNumber : cashAccount.accountNumber,
      isActive: isActive !== undefined ? isActive : cashAccount.isActive,
      isOnlineDefault: isOnlineDefault !== undefined ? isOnlineDefault : cashAccount.isOnlineDefault,
    }, { transaction });
  });

  return cashAccount;
}

async function getAccountBalances(schoolId, accountIds) {
  if (!accountIds.length) return {};
  const rows = await tenantScoped(JournalLine, schoolId).findAll({
    attributes: [
      'accountId',
      [sequelize.fn('SUM', sequelize.col('debitPesewas')), 'totalDebit'],
      [sequelize.fn('SUM', sequelize.col('creditPesewas')), 'totalCredit'],
    ],
    where: { accountId: accountIds },
    group: ['accountId'],
    raw: true,
  });
  const balances = {};
  rows.forEach((row) => {
    balances[row.accountId] = Number(row.totalDebit || 0) - Number(row.totalCredit || 0);
  });
  return balances;
}

async function getCashAccountStatement(schoolId, cashAccountId, { from, to } = {}) {
  const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(cashAccountId, {
    include: [{ model: Account, as: 'account' }],
  });
  if (!cashAccount) throw new ApiError(404, 'Cash account not found');

  return getGeneralLedger(schoolId, cashAccount.accountId, { from, to });
}

// ---- Cash transfers ----

async function createCashTransfer(schoolId, userId, {
  fromCashAccountId, toCashAccountId, amountPesewas, transferDate, reference, notes,
}) {
  if (fromCashAccountId === toCashAccountId) {
    throw new ApiError(400, 'Cannot transfer a cash account to itself');
  }
  return sequelize.transaction(async (transaction) => {
    const [fromAccount, toAccount] = await Promise.all([
      tenantScoped(CashAccount, schoolId).findByPk(fromCashAccountId, { transaction }),
      tenantScoped(CashAccount, schoolId).findByPk(toCashAccountId, { transaction }),
    ]);
    if (!fromAccount || !toAccount) throw new ApiError(404, 'Cash account not found');

    const transfer = await tenantScoped(CashTransfer, schoolId).create({
      fromCashAccountId, toCashAccountId, amountPesewas, transferDate, reference: reference || null,
      notes: notes || null, recordedByUserId: userId,
    }, { transaction });

    await postJournalEntry(schoolId, {
      entryDate: transferDate,
      description: `Cash transfer: ${fromAccount.name} -> ${toAccount.name}`,
      sourceType: 'CASH_TRANSFER',
      sourceId: transfer.id,
      userId,
      lines: [
        { accountId: toAccount.accountId, debitPesewas: amountPesewas },
        { accountId: fromAccount.accountId, creditPesewas: amountPesewas },
      ],
    }, transaction);

    return transfer;
  });
}

async function listCashTransfers(schoolId) {
  return tenantScoped(CashTransfer, schoolId).findAll({
    include: [
      { model: CashAccount, as: 'fromCashAccount' },
      { model: CashAccount, as: 'toCashAccount' },
      { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
    order: [['transferDate', 'DESC']],
  });
}

// ---- Bank deposits & withdrawals ----
// The sibling of Cash Transfer: money moving between a bank/cash account
// and an *external* party or Chart-of-Accounts contra account (Cash on
// Hand, an Income account for a grant, an Expense account for a bank
// charge) rather than between two of the school's own cash accounts.

async function listBankTransactions(schoolId, {
  cashAccountId, type, from, to,
} = {}) {
  const where = {};
  if (cashAccountId) where.cashAccountId = cashAccountId;
  if (type) where.type = type;
  if (from && to) where.transactionDate = { [Op.between]: [from, to] };
  else if (from) where.transactionDate = { [Op.gte]: from };
  else if (to) where.transactionDate = { [Op.lte]: to };

  return tenantScoped(BankTransaction, schoolId).findAll({
    where,
    include: [
      { model: CashAccount, as: 'cashAccount' },
      { model: Account, as: 'contraAccount' },
      { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'voidedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
    order: [['transactionDate', 'DESC'], ['createdAt', 'DESC']],
  });
}

async function createBankTransaction(schoolId, userId, {
  cashAccountId, type, amountPesewas, transactionDate, contraAccountId, counterparty, reference, notes,
  chequeNumber, chequeDate,
}) {
  return sequelize.transaction(async (transaction) => {
    const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(cashAccountId, { transaction });
    if (!cashAccount) throw new ApiError(404, 'Cash account not found');

    const contraAccount = await tenantScoped(Account, schoolId).findByPk(contraAccountId, { transaction });
    if (!contraAccount) throw new ApiError(404, 'Contra account not found');
    if (contraAccount.isCashAccount) {
      throw new ApiError(400, 'Cannot use another cash/bank account as the contra account — use Cash Transfer to move money between your own accounts');
    }

    const bankTransaction = await tenantScoped(BankTransaction, schoolId).create({
      cashAccountId,
      type,
      amountPesewas,
      transactionDate,
      contraAccountId,
      counterparty: counterparty || null,
      reference: reference || null,
      // Cheque details only ever make sense for a withdrawal — silently
      // dropped on a deposit rather than validated, since the UI never
      // shows them there.
      chequeNumber: type === 'WITHDRAWAL' ? (chequeNumber || null) : null,
      chequeDate: type === 'WITHDRAWAL' ? (chequeDate || null) : null,
      notes: notes || null,
      recordedByUserId: userId,
    }, { transaction });

    const isDeposit = type === 'DEPOSIT';
    await postJournalEntry(schoolId, {
      entryDate: transactionDate,
      description: `${isDeposit ? 'Bank deposit' : 'Bank withdrawal'}: ${cashAccount.name}${counterparty ? ` — ${counterparty}` : ''}`,
      sourceType: isDeposit ? 'BANK_DEPOSIT' : 'BANK_WITHDRAWAL',
      sourceId: bankTransaction.id,
      userId,
      lines: [
        {
          accountId: cashAccount.accountId,
          ...(isDeposit ? { debitPesewas: amountPesewas } : { creditPesewas: amountPesewas }),
        },
        {
          accountId: contraAccountId,
          ...(isDeposit ? { creditPesewas: amountPesewas } : { debitPesewas: amountPesewas }),
        },
      ],
    }, transaction);

    return tenantScoped(BankTransaction, schoolId).findByPk(bankTransaction.id, {
      include: [{ model: CashAccount, as: 'cashAccount' }, { model: Account, as: 'contraAccount' }],
      transaction,
    });
  });
}

// Voids (never deletes) a bank deposit/withdrawal by posting a reversal
// through ledgerPoster.reverseEntryFor — the same "append, don't rewrite
// history" mechanism as every other reversal in the system. Refuses once
// any of the entry's lines have already been swept into a bank
// reconciliation, since reversing at that point would silently break a
// statement that's already been signed off on.
async function voidBankTransaction(schoolId, bankTransactionId, userId, { reason }) {
  return sequelize.transaction(async (transaction) => {
    const bankTransaction = await tenantScoped(BankTransaction, schoolId).findByPk(bankTransactionId, { transaction });
    if (!bankTransaction) throw new ApiError(404, 'Bank transaction not found');
    if (bankTransaction.status === 'VOIDED') throw new ApiError(400, 'This transaction has already been voided');

    const sourceType = bankTransaction.type === 'DEPOSIT' ? 'BANK_DEPOSIT' : 'BANK_WITHDRAWAL';
    const entry = await getActiveEntryFor(schoolId, sourceType, bankTransactionId, transaction);
    if (entry?.lines.some((line) => line.reconciledAt)) {
      throw new ApiError(400, 'This transaction is part of a completed bank reconciliation and cannot be voided');
    }

    await reverseEntryFor(schoolId, sourceType, bankTransactionId, { userId, reason }, transaction);
    await bankTransaction.update({
      status: 'VOIDED', voidedAt: new Date(), voidedByUserId: userId, voidReason: reason,
    }, { transaction });

    return bankTransaction;
  });
}

// ---- Bank reconciliation ----
// Standard bank-rec workflow: pick a bank account, enter the statement's
// ending balance as of a date, then check off which of the account's
// journal_lines (from *any* module — bill/expense/payroll payments, cash
// transfers, the bank transactions above) have actually cleared the bank.
// Can only complete once Adjusted Bank Balance == Balance per Books, the
// same "must balance or reject" discipline postJournalEntry already
// enforces for entries.

// Shared by the worksheet, the completion check, and the final report —
// recomputed live each time rather than cached, same as every other
// balance in this module (see CashAccount's "never a stored number that can
// drift" comment).
async function computeReconciliationNumbers(schoolId, reconciliation) {
  const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(reconciliation.cashAccountId);
  const { closingBalancePesewas: bookBalancePesewas } = await getGeneralLedger(
    schoolId, cashAccount.accountId, { to: reconciliation.statementDate },
  );

  // Only lines never permanently reconciled are candidates — anything swept
  // into a *past, completed* reconciliation (reconciledAt set) is excluded
  // for good, exactly like real bank-rec software.
  const lines = await tenantScoped(JournalLine, schoolId).findAll({
    where: { accountId: cashAccount.accountId, reconciledAt: null },
    include: [{
      model: JournalEntry,
      as: 'journalEntry',
      where: { entryDate: { [Op.lte]: reconciliation.statementDate } },
    }],
    order: [[{ model: JournalEntry, as: 'journalEntry' }, 'entryDate', 'ASC'], ['lineOrder', 'ASC']],
  });

  let clearedNetPesewas = 0;
  let unclearedNetPesewas = 0;
  const rows = lines.map((line) => {
    const net = Number(line.debitPesewas) - Number(line.creditPesewas);
    const cleared = line.bankReconciliationId === reconciliation.id;
    if (cleared) clearedNetPesewas += net; else unclearedNetPesewas += net;
    return {
      id: line.id,
      entryDate: line.journalEntry.entryDate,
      entryNumber: line.journalEntry.entryNumber,
      description: line.description || line.journalEntry.description,
      sourceType: line.journalEntry.sourceType,
      debitPesewas: line.debitPesewas,
      creditPesewas: line.creditPesewas,
      cleared,
    };
  });

  // Deposits in transit (uncleared debits) add, outstanding withdrawals
  // (uncleared credits) subtract — unclearedNetPesewas already carries both
  // signs, so this single addition is the textbook "Balance per bank
  // statement + deposits in transit − outstanding withdrawals" line.
  const adjustedBankBalancePesewas = reconciliation.statementEndingBalancePesewas + unclearedNetPesewas;
  const differencePesewas = adjustedBankBalancePesewas - bookBalancePesewas;

  return {
    cashAccount, rows, bookBalancePesewas, clearedNetPesewas, unclearedNetPesewas, adjustedBankBalancePesewas, differencePesewas,
  };
}

async function startBankReconciliation(schoolId, userId, {
  cashAccountId, statementDate, statementEndingBalancePesewas, notes,
}) {
  const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(cashAccountId);
  if (!cashAccount) throw new ApiError(404, 'Cash account not found');

  const existing = await tenantScoped(BankReconciliation, schoolId).findOne({
    where: { cashAccountId, status: 'IN_PROGRESS' },
  });
  if (existing) throw new ApiError(400, 'This account already has a reconciliation in progress — complete or cancel it first');

  return tenantScoped(BankReconciliation, schoolId).create({
    cashAccountId, statementDate, statementEndingBalancePesewas, notes: notes || null, preparedByUserId: userId,
  });
}

async function getBankReconciliation(schoolId, reconciliationId) {
  const reconciliation = await tenantScoped(BankReconciliation, schoolId).findByPk(reconciliationId, {
    include: [
      { model: CashAccount, as: 'cashAccount' },
      { model: User, as: 'preparedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'completedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
  });
  if (!reconciliation) throw new ApiError(404, 'Reconciliation not found');
  return reconciliation;
}

async function getBankReconciliationWorksheet(schoolId, reconciliationId) {
  const reconciliation = await getBankReconciliation(schoolId, reconciliationId);
  const numbers = await computeReconciliationNumbers(schoolId, reconciliation);
  return { reconciliation, ...numbers };
}

// Deliberately returns just the reconciliation header, not a recomputed
// worksheet — computeReconciliationNumbers re-walks the account's entire
// JournalLine history (see getGeneralLedger) and is the single most
// expensive query in this feature; the frontend already knows the
// selection it just saved and refetches the worksheet itself when it needs
// fresh numbers, so paying that cost again here would be pure waste.
async function setBankReconciliationClearedLines(schoolId, reconciliationId, journalLineIds) {
  const reconciliation = await getBankReconciliation(schoolId, reconciliationId);
  if (reconciliation.status !== 'IN_PROGRESS') throw new ApiError(400, 'Only an in-progress reconciliation can be edited');

  return sequelize.transaction(async (transaction) => {
    await tenantScoped(JournalLine, schoolId).update(
      { bankReconciliationId: null },
      {
        where: {
          bankReconciliationId: reconciliationId,
          id: { [Op.notIn]: journalLineIds.length ? journalLineIds : [null] },
        },
        transaction,
      },
    );
    if (journalLineIds.length) {
      await tenantScoped(JournalLine, schoolId).update(
        { bankReconciliationId: reconciliationId },
        {
          where: { id: journalLineIds, accountId: reconciliation.cashAccount.accountId, reconciledAt: null },
          transaction,
        },
      );
    }
    return reconciliation;
  });
}

async function completeBankReconciliation(schoolId, reconciliationId, userId) {
  return sequelize.transaction(async (transaction) => {
    const reconciliation = await tenantScoped(BankReconciliation, schoolId).findByPk(reconciliationId, {
      include: [{ model: CashAccount, as: 'cashAccount' }],
      transaction,
    });
    if (!reconciliation) throw new ApiError(404, 'Reconciliation not found');
    if (reconciliation.status !== 'IN_PROGRESS') throw new ApiError(400, 'This reconciliation has already been completed');

    const { rows, bookBalancePesewas, differencePesewas } = await computeReconciliationNumbers(schoolId, reconciliation);
    if (differencePesewas !== 0) {
      throw new ApiError(
        400,
        `Reconciliation is out of balance by GHS ${(Math.abs(differencePesewas) / 100).toFixed(2)} — check off or correct the outstanding items before completing`,
      );
    }

    const clearedLineIds = rows.filter((row) => row.cleared).map((row) => row.id);
    if (clearedLineIds.length) {
      await tenantScoped(JournalLine, schoolId).update(
        { reconciledAt: reconciliation.statementDate },
        { where: { id: clearedLineIds }, transaction },
      );
    }

    await reconciliation.update({
      status: 'COMPLETED', completedAt: new Date(), completedByUserId: userId, bookBalancePesewas,
    }, { transaction });

    return reconciliation;
  });
}

async function cancelBankReconciliation(schoolId, reconciliationId) {
  return sequelize.transaction(async (transaction) => {
    const reconciliation = await tenantScoped(BankReconciliation, schoolId).findByPk(reconciliationId, { transaction });
    if (!reconciliation) throw new ApiError(404, 'Reconciliation not found');
    if (reconciliation.status !== 'IN_PROGRESS') throw new ApiError(400, 'Only an in-progress reconciliation can be cancelled');

    await tenantScoped(JournalLine, schoolId).update(
      { bankReconciliationId: null },
      { where: { bankReconciliationId: reconciliationId }, transaction },
    );
    await reconciliation.destroy({ transaction });
  });
}

async function listBankReconciliations(schoolId, { cashAccountId } = {}) {
  const where = {};
  if (cashAccountId) where.cashAccountId = cashAccountId;
  return tenantScoped(BankReconciliation, schoolId).findAll({
    where,
    include: [
      { model: CashAccount, as: 'cashAccount' },
      { model: User, as: 'preparedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'completedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
    order: [['statementDate', 'DESC']],
  });
}

// The deliverable "Bank Reconciliation Report" — the classic two-column
// statement. Works for both an IN_PROGRESS reconciliation (a live preview
// of where things currently stand) and a COMPLETED one (the final,
// unchanging statement, since its lines' reconciledAt is now permanently set).
async function getBankReconciliationReport(schoolId, reconciliationId) {
  const {
    reconciliation, cashAccount, rows, bookBalancePesewas, adjustedBankBalancePesewas, differencePesewas,
  } = await getBankReconciliationWorksheet(schoolId, reconciliationId);

  const depositsInTransit = rows.filter((row) => !row.cleared && Number(row.debitPesewas) - Number(row.creditPesewas) > 0);
  const outstandingWithdrawals = rows.filter((row) => !row.cleared && Number(row.debitPesewas) - Number(row.creditPesewas) < 0);

  const depositsInTransitTotalPesewas = depositsInTransit.reduce(
    (sum, row) => sum + (Number(row.debitPesewas) - Number(row.creditPesewas)), 0,
  );
  const outstandingWithdrawalsTotalPesewas = outstandingWithdrawals.reduce(
    (sum, row) => sum + (Number(row.creditPesewas) - Number(row.debitPesewas)), 0,
  );

  return {
    reconciliation,
    cashAccount,
    statementDate: reconciliation.statementDate,
    statementEndingBalancePesewas: reconciliation.statementEndingBalancePesewas,
    depositsInTransit,
    depositsInTransitTotalPesewas,
    outstandingWithdrawals,
    outstandingWithdrawalsTotalPesewas,
    adjustedBankBalancePesewas,
    bookBalancePesewas,
    differencePesewas,
  };
}

// ---- Manual journal entries + journal register ----

async function createManualJournalEntry(schoolId, userId, { entryDate, description, lines }) {
  return sequelize.transaction((transaction) => postJournalEntry(schoolId, {
    entryDate, description, sourceType: 'MANUAL', sourceId: null, userId, lines,
  }, transaction));
}

async function updateManualJournalEntry(schoolId, journalEntryId, userId, { reason, entryDate, description, lines }) {
  return sequelize.transaction(async (transaction) => {
    const entry = await tenantScoped(JournalEntry, schoolId).findByPk(journalEntryId, { transaction });
    if (!entry) throw new ApiError(404, 'Journal entry not found');
    if (entry.sourceType !== 'MANUAL') throw new ApiError(400, 'Only a manual journal entry can be edited this way');

    await reverseEntryById(schoolId, journalEntryId, { userId, reason }, transaction);
    return postJournalEntry(schoolId, {
      entryDate, description, sourceType: 'MANUAL', sourceId: null, userId, lines,
    }, transaction);
  });
}

async function listJournalEntries(schoolId, {
  from, to, sourceType, accountId, page = 1, pageSize = 50,
} = {}) {
  const where = {};
  if (from && to) where.entryDate = { [Op.between]: [from, to] };
  else if (from) where.entryDate = { [Op.gte]: from };
  else if (to) where.entryDate = { [Op.lte]: to };
  if (sourceType) where.sourceType = sourceType;

  const lineWhere = accountId ? { accountId } : undefined;

  const entries = await JournalEntry.findAndCountAll({
    where: { ...where, schoolId },
    include: [
      {
        model: JournalLine,
        as: 'lines',
        where: lineWhere,
        required: !!accountId,
        include: [{ model: Account, as: 'account' }],
      },
      { model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
    order: [['entryDate', 'DESC'], ['entryNumber', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
  });

  return { entries: entries.rows, total: entries.count, page, pageSize };
}

async function getJournalEntry(schoolId, journalEntryId) {
  const entry = await tenantScoped(JournalEntry, schoolId).findByPk(journalEntryId, {
    include: [
      { model: JournalLine, as: 'lines', include: [{ model: Account, as: 'account' }] },
      { model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
  });
  if (!entry) throw new ApiError(404, 'Journal entry not found');
  return entry;
}

function userSummary(user) {
  return user ? { id: user.id, fullName: user.fullName, email: user.email } : null;
}

// Every reversal in the system — whatever module triggered it (transport,
// fee/levy/expense payments, admission payments, petty cash, or a manual
// journal edit) — goes through ledgerPoster's reverseEntryFor/reverseEntryById,
// which always posts a brand-new JournalEntry with reversalOfEntryId set
// rather than mutating the original. That means this single query already
// has full "who/when/why" for every reversal ever made, with nothing extra
// to track — postedAt is the real reversal timestamp (entryDate instead
// mirrors the *original* transaction's date, so it's not usable for "when
// was this reversed").
async function getReversalsReport(schoolId, {
  from, to, sourceType, userId,
} = {}) {
  const where = { reversalOfEntryId: { [Op.ne]: null } };
  if (from) where.postedAt = { ...(where.postedAt || {}), [Op.gte]: new Date(`${from}T00:00:00`) };
  if (to) where.postedAt = { ...(where.postedAt || {}), [Op.lte]: new Date(`${to}T23:59:59.999`) };
  if (sourceType) where.sourceType = sourceType;
  if (userId) where.createdByUserId = userId;

  const reversals = await JournalEntry.findAll({
    where: { ...where, schoolId },
    include: [
      { model: JournalLine, as: 'lines' },
      { model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES },
      {
        model: JournalEntry,
        as: 'reversalOf',
        include: [{ model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES }],
      },
    ],
    order: [['postedAt', 'DESC']],
  });

  const rows = reversals.map((entry) => ({
    journalEntryId: entry.id,
    entryNumber: entry.entryNumber,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    // Balanced by construction (postJournalEntry rejects anything else), so
    // summing either side gives the value that was reversed.
    amountPesewas: entry.lines.reduce((sum, l) => sum + l.debitPesewas, 0),
    reason: entry.description,
    reversedAt: entry.postedAt,
    reversedBy: userSummary(entry.createdBy),
    originalEntryNumber: entry.reversalOf?.entryNumber || null,
    originallyPostedAt: entry.reversalOf?.postedAt || null,
    originallyPostedBy: userSummary(entry.reversalOf?.createdBy),
  }));

  const bySourceTypeMap = new Map();
  const byUserMap = new Map();
  const byDayMap = new Map();
  let totalAmountPesewas = 0;

  for (const row of rows) {
    totalAmountPesewas += row.amountPesewas;

    const st = bySourceTypeMap.get(row.sourceType) || { sourceType: row.sourceType, count: 0, amountPesewas: 0 };
    st.count += 1;
    st.amountPesewas += row.amountPesewas;
    bySourceTypeMap.set(row.sourceType, st);

    const userKey = row.reversedBy?.id || 'unknown';
    const u = byUserMap.get(userKey) || {
      userId: row.reversedBy?.id || null,
      name: row.reversedBy?.fullName || row.reversedBy?.email || 'Unknown',
      count: 0,
      amountPesewas: 0,
    };
    u.count += 1;
    u.amountPesewas += row.amountPesewas;
    byUserMap.set(userKey, u);

    const day = row.reversedAt.toISOString().slice(0, 10);
    const d = byDayMap.get(day) || { date: day, count: 0, amountPesewas: 0 };
    d.count += 1;
    d.amountPesewas += row.amountPesewas;
    byDayMap.set(day, d);
  }

  return {
    rows,
    summary: {
      totalCount: rows.length,
      totalAmountPesewas,
      uniqueUsers: byUserMap.size,
      bySourceType: [...bySourceTypeMap.values()].sort((a, b) => b.count - a.count),
      byUser: [...byUserMap.values()].sort((a, b) => b.count - a.count),
      trend: [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    },
  };
}

// ---- General ledger drill-down ----

async function getGeneralLedger(schoolId, accountId, { from, to } = {}) {
  const account = await tenantScoped(Account, schoolId).findByPk(accountId);
  if (!account) throw new ApiError(404, 'Account not found');

  const openingWhere = { accountId };
  if (from) openingWhere['$journalEntry.entryDate$'] = { [Op.lt]: from };
  else openingWhere['$journalEntry.entryDate$'] = { [Op.lt]: '0001-01-01' };

  const openingRows = from
    ? await tenantScoped(JournalLine, schoolId).findAll({
      where: { accountId },
      include: [{ model: JournalEntry, as: 'journalEntry', where: { entryDate: { [Op.lt]: from } }, attributes: [] }],
      raw: true,
    })
    : [];
  const openingBalance = openingRows.reduce(
    (sum, l) => sum + Number(l.debitPesewas || 0) - Number(l.creditPesewas || 0), 0,
  );

  const entryDateWhere = {};
  if (from && to) entryDateWhere.entryDate = { [Op.between]: [from, to] };
  else if (from) entryDateWhere.entryDate = { [Op.gte]: from };
  else if (to) entryDateWhere.entryDate = { [Op.lte]: to };

  const lines = await tenantScoped(JournalLine, schoolId).findAll({
    where: { accountId },
    include: [{ model: JournalEntry, as: 'journalEntry', where: entryDateWhere }],
    order: [[{ model: JournalEntry, as: 'journalEntry' }, 'entryDate', 'ASC'], ['lineOrder', 'ASC']],
  });

  let runningBalance = openingBalance;
  const rows = lines.map((line) => {
    runningBalance += Number(line.debitPesewas) - Number(line.creditPesewas);
    return {
      id: line.id,
      entryDate: line.journalEntry.entryDate,
      entryNumber: line.journalEntry.entryNumber,
      description: line.description || line.journalEntry.description,
      sourceType: line.journalEntry.sourceType,
      debitPesewas: line.debitPesewas,
      creditPesewas: line.creditPesewas,
      runningBalancePesewas: runningBalance,
    };
  });

  return { account, openingBalancePesewas: openingBalance, closingBalancePesewas: runningBalance, lines: rows };
}

// ---- Statements ----

async function getTrialBalance(schoolId, { asOf } = {}) {
  const accounts = await tenantScoped(Account, schoolId).findAll({ order: [['code', 'ASC']] });
  const where = asOf ? { entryDate: { [Op.lte]: asOf } } : undefined;

  const lines = await tenantScoped(JournalLine, schoolId).findAll({
    attributes: [
      'accountId',
      [sequelize.fn('SUM', sequelize.col('JournalLine.debitPesewas')), 'totalDebit'],
      [sequelize.fn('SUM', sequelize.col('JournalLine.creditPesewas')), 'totalCredit'],
    ],
    include: [{ model: JournalEntry, as: 'journalEntry', where, attributes: [] }],
    group: ['accountId'],
    raw: true,
  });
  const totals = {};
  lines.forEach((l) => { totals[l.accountId] = { debit: Number(l.totalDebit || 0), credit: Number(l.totalCredit || 0) }; });

  let totalDebitBalance = 0;
  let totalCreditBalance = 0;
  const rows = accounts.map((account) => {
    const t = totals[account.id] || { debit: 0, credit: 0 };
    const net = t.debit - t.credit;
    const debitBalance = net > 0 ? net : 0;
    const creditBalance = net < 0 ? -net : 0;
    totalDebitBalance += debitBalance;
    totalCreditBalance += creditBalance;
    return {
      accountId: account.id, code: account.code, name: account.name, type: account.type,
      debitBalancePesewas: debitBalance, creditBalancePesewas: creditBalance,
    };
  }).filter((row) => row.debitBalancePesewas !== 0 || row.creditBalancePesewas !== 0);

  return { asOf: asOf || null, rows, totalDebitBalancePesewas: totalDebitBalance, totalCreditBalancePesewas: totalCreditBalance };
}

async function sumAccountsByType(schoolId, type, { from, to } = {}) {
  const entryDateWhere = {};
  if (from && to) entryDateWhere.entryDate = { [Op.between]: [from, to] };
  else if (from) entryDateWhere.entryDate = { [Op.gte]: from };
  else if (to) entryDateWhere.entryDate = { [Op.lte]: to };

  const accounts = await tenantScoped(Account, schoolId).findAll({ where: { type }, order: [['code', 'ASC']] });
  const lines = await tenantScoped(JournalLine, schoolId).findAll({
    attributes: [
      'accountId',
      [sequelize.fn('SUM', sequelize.col('JournalLine.debitPesewas')), 'totalDebit'],
      [sequelize.fn('SUM', sequelize.col('JournalLine.creditPesewas')), 'totalCredit'],
    ],
    where: { accountId: accounts.map((a) => a.id) },
    include: [{ model: JournalEntry, as: 'journalEntry', where: Object.keys(entryDateWhere).length ? entryDateWhere : undefined, attributes: [] }],
    group: ['accountId'],
    raw: true,
  });
  const totals = {};
  lines.forEach((l) => { totals[l.accountId] = Number(l.totalDebit || 0) - Number(l.totalCredit || 0); });

  return accounts.map((account) => {
    const net = totals[account.id] || 0;
    // Present every account in its own normal-balance direction, then flip
    // contra accounts (Accumulated Depreciation, Discounts & Waivers) to a
    // negative deduction from their parent type's total — both standard
    // financial-statement presentation, and required so a naive sum of
    // these rows (totalAssetsPesewas, totalIncomePesewas, ...) actually
    // nets them out instead of double-counting them as a positive addition.
    let amountPesewas = account.normalBalance === 'DEBIT' ? net : -net;
    if (account.isContra) amountPesewas = -amountPesewas;
    return {
      accountId: account.id, code: account.code, name: account.name, amountPesewas, isContra: account.isContra,
    };
  }).filter((row) => row.amountPesewas !== 0);
}

async function getIncomeStatement(schoolId, { from, to } = {}) {
  const income = await sumAccountsByType(schoolId, 'INCOME', { from, to });
  const expenses = await sumAccountsByType(schoolId, 'EXPENSE', { from, to });
  const totalIncomePesewas = income.reduce((sum, r) => sum + r.amountPesewas, 0);
  const totalExpensePesewas = expenses.reduce((sum, r) => sum + r.amountPesewas, 0);
  return {
    from: from || null,
    to: to || null,
    income,
    expenses,
    totalIncomePesewas,
    totalExpensePesewas,
    netSurplusPesewas: totalIncomePesewas - totalExpensePesewas,
  };
}

async function getBalanceSheet(schoolId, { asOf } = {}) {
  const assets = await sumAccountsByType(schoolId, 'ASSET', { to: asOf });
  const liabilities = await sumAccountsByType(schoolId, 'LIABILITY', { to: asOf });
  const equity = await sumAccountsByType(schoolId, 'EQUITY', { to: asOf });
  const { netSurplusPesewas } = await getIncomeStatement(schoolId, { to: asOf });

  const totalAssetsPesewas = assets.reduce((sum, r) => sum + r.amountPesewas, 0);
  const totalLiabilitiesPesewas = liabilities.reduce((sum, r) => sum + r.amountPesewas, 0);
  const totalBookedEquityPesewas = equity.reduce((sum, r) => sum + r.amountPesewas, 0);
  // Net income/surplus not yet closed to Retained Earnings still belongs to
  // Equity for the balance sheet to hold: Assets = Liabilities + Equity.
  const totalEquityPesewas = totalBookedEquityPesewas + netSurplusPesewas;

  return {
    asOf: asOf || null,
    assets,
    liabilities,
    equity,
    totalAssetsPesewas,
    totalLiabilitiesPesewas,
    totalBookedEquityPesewas,
    currentPeriodNetSurplusPesewas: netSurplusPesewas,
    totalEquityPesewas,
    totalLiabilitiesAndEquityPesewas: totalLiabilitiesPesewas + totalEquityPesewas,
  };
}

const OPERATING_SOURCE_TYPES = [
  'BILL_PAYMENT', 'LEVY_PAYMENT', 'ADMISSION_PAYMENT', 'EXPENSE_PAYMENT',
  'PAYROLL_PAYMENT', 'STATUTORY_REMITTANCE',
];
const INVESTING_SOURCE_TYPES = ['ASSET_PURCHASE', 'ASSET_DISPOSAL'];

async function getCashFlowStatement(schoolId, { from, to } = {}) {
  const cashAccounts = await tenantScoped(Account, schoolId).findAll({ where: { isCashAccount: true } });
  const cashAccountIds = cashAccounts.map((a) => a.id);
  if (!cashAccountIds.length) {
    return {
      from: from || null, to: to || null, operating: [], investing: [], financing: [], other: [],
      netChangeInCashPesewas: 0, openingCashPesewas: 0, closingCashPesewas: 0,
    };
  }

  const entryDateWhere = {};
  if (from && to) entryDateWhere.entryDate = { [Op.between]: [from, to] };
  else if (from) entryDateWhere.entryDate = { [Op.gte]: from };
  else if (to) entryDateWhere.entryDate = { [Op.lte]: to };

  const lines = await tenantScoped(JournalLine, schoolId).findAll({
    where: { accountId: cashAccountIds },
    include: [{ model: JournalEntry, as: 'journalEntry', where: entryDateWhere }],
  });

  const buckets = { operating: 0, investing: 0, financing: 0, other: 0 };
  const bySourceType = {};
  lines.forEach((line) => {
    const net = Number(line.debitPesewas) - Number(line.creditPesewas);
    const sourceType = line.journalEntry.sourceType;
    const bucket = OPERATING_SOURCE_TYPES.includes(sourceType)
      ? 'operating'
      : INVESTING_SOURCE_TYPES.includes(sourceType) ? 'investing' : 'other';
    buckets[bucket] += net;
    bySourceType[sourceType] = (bySourceType[sourceType] || 0) + net;
  });

  const openingBalances = from ? await getAccountBalances(schoolId, cashAccountIds) : {};
  const openingCashPesewas = from
    ? (await Promise.all(cashAccountIds.map(async (id) => {
      const bal = await getGeneralLedger(schoolId, id, { to: new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10) });
      return bal.closingBalancePesewas;
    }))).reduce((sum, v) => sum + v, 0)
    : 0;

  const netChangeInCashPesewas = buckets.operating + buckets.investing + buckets.financing + buckets.other;

  return {
    from: from || null,
    to: to || null,
    bySourceType,
    operatingActivitiesPesewas: buckets.operating,
    investingActivitiesPesewas: buckets.investing,
    financingActivitiesPesewas: buckets.financing,
    otherActivitiesPesewas: buckets.other,
    netChangeInCashPesewas,
    openingCashPesewas,
    closingCashPesewas: openingCashPesewas + netChangeInCashPesewas,
  };
}

// ---- Accounts Payable aging ----
// Outstanding liability = approved but not yet paid — bucketed by how long
// ago the expense was incurred (expenseDate), the same "age" dimension the
// existing Debtors report uses for receivables.

const AGE_BUCKETS = [
  { label: '0-30 days', maxDays: 30 },
  { label: '31-60 days', maxDays: 60 },
  { label: '61-90 days', maxDays: 90 },
  { label: '90+ days', maxDays: Infinity },
];

function bucketForAge(ageDays) {
  return AGE_BUCKETS.find((bucket) => ageDays <= bucket.maxDays).label;
}

async function getApAging(schoolId) {
  const requests = await tenantScoped(ExpenseRequest, schoolId).findAll({
    where: { status: 'APPROVED', paymentStatus: 'UNPAID' },
    include: [ExpenseItem],
    order: [['expenseDate', 'ASC']],
  });

  const today = new Date();
  const rows = requests.map((request) => {
    const ageDays = Math.floor((today - new Date(request.expenseDate)) / (1000 * 60 * 60 * 24));
    return {
      id: request.id,
      description: request.description,
      expenseItemName: request.ExpenseItem?.name,
      expenseDate: request.expenseDate,
      amountPesewas: request.amountPesewas,
      ageDays,
      bucket: bucketForAge(ageDays),
    };
  });

  const totalsByBucket = {};
  AGE_BUCKETS.forEach((b) => { totalsByBucket[b.label] = 0; });
  rows.forEach((row) => { totalsByBucket[row.bucket] += row.amountPesewas; });

  return {
    rows,
    totalsByBucket,
    totalOutstandingPesewas: rows.reduce((sum, r) => sum + r.amountPesewas, 0),
  };
}

// ---- Year-end close ----
// Zeroes every Income/Expense account for the year (each gets a line
// bringing its balance to zero) and plugs the net surplus/deficit to
// Retained Earnings — not strictly required for correct period reporting
// (Income Statement queries are already date-range-scoped), but needed so
// the Balance Sheet's Equity section rolls forward correctly year over
// year instead of needing an all-time-since-inception Income sum baked
// into every render. SCHOOL_ADMIN-only (see routes.js) and idempotent —
// refuses to run twice for the same academic year.
async function closeAcademicYear(schoolId, academicYearId, userId) {
  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  const alreadyClosed = await tenantScoped(JournalEntry, schoolId).findOne({
    where: { sourceType: 'PERIOD_CLOSE', sourceId: academicYearId },
  });
  if (alreadyClosed) throw new ApiError(400, 'This academic year has already been closed');

  const { income, expenses, netSurplusPesewas } = await getIncomeStatement(schoolId, {
    from: year.startDate, to: year.endDate,
  });
  if (income.length === 0 && expenses.length === 0) {
    throw new ApiError(400, 'No income or expense activity to close for this academic year');
  }

  const lines = [
    ...income.map((row) => ({ accountId: row.accountId, debitPesewas: row.amountPesewas })),
    ...expenses.map((row) => ({ accountId: row.accountId, creditPesewas: row.amountPesewas })),
  ];
  if (netSurplusPesewas > 0) lines.push({ accountCode: '3000', creditPesewas: netSurplusPesewas });
  else if (netSurplusPesewas < 0) lines.push({ accountCode: '3000', debitPesewas: -netSurplusPesewas });

  return sequelize.transaction((transaction) => postJournalEntry(schoolId, {
    entryDate: year.endDate,
    description: `Year-end close: ${year.name}`,
    sourceType: 'PERIOD_CLOSE',
    sourceId: academicYearId,
    userId,
    lines,
  }, transaction));
}

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
  startBankReconciliation,
  getBankReconciliationWorksheet,
  setBankReconciliationClearedLines,
  completeBankReconciliation,
  cancelBankReconciliation,
  listBankReconciliations,
  getBankReconciliationReport,
  createManualJournalEntry,
  updateManualJournalEntry,
  listJournalEntries,
  getJournalEntry,
  getReversalsReport,
  getGeneralLedger,
  getTrialBalance,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlowStatement,
  getAccountBalances,
  getApAging,
  closeAcademicYear,
};
