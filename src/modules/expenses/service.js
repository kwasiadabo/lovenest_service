const { Op } = require('sequelize');
const {
  sequelize, ExpenseItem, ExpenseRequest, User, CashAccount,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { postJournalEntry, reverseEntryFor } = require('../accounting/ledgerPoster');
const { EXPENSE_CATEGORY_ACCOUNT_CODES } = require('../../utils/defaultChartOfAccounts');

// Every User include in this file must be scoped to this — full User rows
// carry passwordHash/resetPasswordTokenHash, which must never reach the API
// response (same convention as financials/service.js).
const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

// ---- Expense items (setup) ----
// Directly mirrors fees/service.js's fee-type CRUD — no per-class/term
// amount matrix needed here, an expense item is just a name + category.

async function listExpenseItems(schoolId) {
  return tenantScoped(ExpenseItem, schoolId).findAll({ order: [['category', 'ASC'], ['name', 'ASC']] });
}

async function createExpenseItem(schoolId, { name, category }) {
  return tenantScoped(ExpenseItem, schoolId).create({ name, category: category || 'OTHER' });
}

async function updateExpenseItem(schoolId, expenseItemId, { name, category }) {
  const item = await tenantScoped(ExpenseItem, schoolId).findByPk(expenseItemId);
  if (!item) throw new ApiError(404, 'Expense item not found');
  await item.update({ name, category });
  return item;
}

// Removing an expense item also removes every request made against it —
// there's no use for an orphaned ExpenseRequest, and the FK (NO ACTION,
// matching this codebase's cascade convention) would otherwise block the
// delete outright.
async function deleteExpenseItem(schoolId, expenseItemId) {
  await sequelize.transaction(async (transaction) => {
    await tenantScoped(ExpenseRequest, schoolId).destroy({ where: { expenseItemId }, transaction });
    const deleted = await tenantScoped(ExpenseItem, schoolId).destroy({ where: { id: expenseItemId }, transaction });
    if (!deleted) throw new ApiError(404, 'Expense item not found');
  });
}

// ---- Expense requests (workflow) ----

const REQUEST_INCLUDE = [
  ExpenseItem,
  { model: User, as: 'requestedBy', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: User, as: 'reviewedBy', attributes: USER_SUMMARY_ATTRIBUTES },
];

async function listExpenseRequests(schoolId, {
  status, expenseItemId, from, to,
} = {}) {
  const where = {};
  if (status) where.status = status;
  if (expenseItemId) where.expenseItemId = expenseItemId;
  if (from && to) where.expenseDate = { [Op.between]: [from, to] };
  else if (from) where.expenseDate = { [Op.gte]: from };
  else if (to) where.expenseDate = { [Op.lte]: to };

  return tenantScoped(ExpenseRequest, schoolId).findAll({
    where,
    include: REQUEST_INCLUDE,
    order: [['createdAt', 'DESC']],
  });
}

async function createExpenseRequest(schoolId, userId, {
  expenseItemId, amountPesewas, description, expenseDate,
}) {
  const item = await tenantScoped(ExpenseItem, schoolId).findByPk(expenseItemId);
  if (!item) throw new ApiError(404, 'Expense item not found');

  const request = await tenantScoped(ExpenseRequest, schoolId).create({
    expenseItemId,
    amountPesewas,
    description,
    expenseDate,
    requestedByUserId: userId,
    status: 'PENDING',
  });

  return tenantScoped(ExpenseRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

// A requester may fix their own not-yet-decided request; SCHOOL_ADMIN can
// override anyone's — the route-level role guard alone can't express "your
// own request", so that ownership check lives here.
function assertCanModify(request, userId, isSchoolAdmin) {
  if (!request) throw new ApiError(404, 'Expense request not found');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be edited or cancelled');
  if (request.requestedByUserId !== userId && !isSchoolAdmin) {
    throw new ApiError(403, 'You can only edit or cancel your own request');
  }
}

async function updateExpenseRequest(schoolId, requestId, userId, isSchoolAdmin, {
  expenseItemId, amountPesewas, description, expenseDate,
}) {
  const request = await tenantScoped(ExpenseRequest, schoolId).findByPk(requestId);
  assertCanModify(request, userId, isSchoolAdmin);

  const item = await tenantScoped(ExpenseItem, schoolId).findByPk(expenseItemId);
  if (!item) throw new ApiError(404, 'Expense item not found');

  await request.update({
    expenseItemId, amountPesewas, description, expenseDate,
  });
  return tenantScoped(ExpenseRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

async function deleteExpenseRequest(schoolId, requestId, userId, isSchoolAdmin) {
  const request = await tenantScoped(ExpenseRequest, schoolId).findByPk(requestId);
  if (!request) throw new ApiError(404, 'Expense request not found');

  // A decided request is a financial record — SCHOOL_ADMIN can still void
  // an APPROVED one outright (no partial-edit trail for this v1), but a
  // REJECTED one just stays as history.
  if (request.status === 'PENDING') {
    assertCanModify(request, userId, isSchoolAdmin);
  } else if (request.status === 'APPROVED') {
    if (!isSchoolAdmin) throw new ApiError(403, 'Only a school admin can delete an approved expense');
  } else {
    throw new ApiError(400, 'A rejected request cannot be deleted');
  }

  await sequelize.transaction(async (transaction) => {
    if (request.status === 'APPROVED') {
      // Reverse in reverse-chronological order — if it was paid, the
      // liability briefly reappears before EXPENSE_APPROVAL clears it too,
      // rather than jumping straight from "cash gone" to "never happened".
      if (request.paymentStatus === 'PAID') {
        await reverseEntryFor(schoolId, 'EXPENSE_PAYMENT', request.id, { userId, reason: 'Expense request deleted' }, transaction);
      }
      await reverseEntryFor(schoolId, 'EXPENSE_APPROVAL', request.id, { userId, reason: 'Expense request deleted' }, transaction);
    }
    await tenantScoped(ExpenseRequest, schoolId).destroy({ where: { id: requestId }, transaction });
  });
}

// Recognizes the liability at the moment of approval — Dr the expense
// account (mapped from the item's category), Cr Accounts Payable. Cash
// doesn't move yet; that's markExpenseRequestPaid's job.
async function postExpenseApproval(schoolId, request, expenseItem, userId, transaction) {
  const accountCode = EXPENSE_CATEGORY_ACCOUNT_CODES[expenseItem.category] || EXPENSE_CATEGORY_ACCOUNT_CODES.OTHER;
  await postJournalEntry(schoolId, {
    entryDate: request.expenseDate,
    description: `Expense approved: ${request.description}`,
    sourceType: 'EXPENSE_APPROVAL',
    sourceId: request.id,
    userId,
    lines: [
      { accountCode, debitPesewas: request.amountPesewas },
      { accountCode: '2000', creditPesewas: request.amountPesewas },
    ],
  }, transaction);
}

async function approveExpenseRequest(schoolId, requestId, userId) {
  const request = await tenantScoped(ExpenseRequest, schoolId).findByPk(requestId);
  if (!request) throw new ApiError(404, 'Expense request not found');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be approved');
  if (request.requestedByUserId === userId) {
    throw new ApiError(403, 'You cannot approve your own request — another approver must act on it');
  }

  const expenseItem = await tenantScoped(ExpenseItem, schoolId).findByPk(request.expenseItemId);
  if (!expenseItem) throw new ApiError(404, 'Expense item not found');

  await sequelize.transaction(async (transaction) => {
    await request.update({
      status: 'APPROVED',
      paymentStatus: 'UNPAID',
      reviewedByUserId: userId,
      reviewedAt: new Date(),
    }, { transaction });
    await postExpenseApproval(schoolId, request, expenseItem, userId, transaction);
  });

  return tenantScoped(ExpenseRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

// The second, separate step — cash actually leaving a named account.
// Dr Accounts Payable / Cr the chosen CashAccount, clearing the liability
// postExpenseApproval recognized.
async function markExpenseRequestPaid(schoolId, requestId, userId, {
  paymentMethod, paymentReference, paidDate, cashAccountId,
}) {
  const request = await tenantScoped(ExpenseRequest, schoolId).findByPk(requestId);
  if (!request) throw new ApiError(404, 'Expense request not found');
  if (request.status !== 'APPROVED') throw new ApiError(400, 'Only an approved request can be marked paid');
  if (request.paymentStatus === 'PAID') throw new ApiError(400, 'This request has already been marked paid');

  await sequelize.transaction(async (transaction) => {
    const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(cashAccountId, { transaction });
    if (!cashAccount) throw new ApiError(400, 'cashAccountId does not refer to a valid cash account');

    await request.update({
      paymentStatus: 'PAID',
      paymentMethod,
      paymentReference: paymentReference || null,
      paidDate,
      cashAccountId,
    }, { transaction });

    await postJournalEntry(schoolId, {
      entryDate: paidDate,
      description: `Expense paid: ${request.description}`,
      sourceType: 'EXPENSE_PAYMENT',
      sourceId: request.id,
      userId,
      lines: [
        { accountCode: '2000', debitPesewas: request.amountPesewas },
        { accountId: cashAccount.accountId, creditPesewas: request.amountPesewas },
      ],
    }, transaction);
  });

  return tenantScoped(ExpenseRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

async function rejectExpenseRequest(schoolId, requestId, userId, { rejectionReason }) {
  const request = await tenantScoped(ExpenseRequest, schoolId).findByPk(requestId);
  if (!request) throw new ApiError(404, 'Expense request not found');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be rejected');
  if (request.requestedByUserId === userId) {
    throw new ApiError(403, 'You cannot reject your own request — another approver must act on it');
  }

  await request.update({
    status: 'REJECTED',
    reviewedByUserId: userId,
    reviewedAt: new Date(),
    rejectionReason,
  });
  return tenantScoped(ExpenseRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

// ---- Report ----
// paymentStatus='PAID' is the definition of "recorded" — an approved-but-
// unpaid request is a real Accounts Payable liability (see AP Aging) but
// hasn't moved any cash yet, and a pending/rejected request never happened
// as far as the school's books are concerned. Scoped by paidDate (when the
// money actually moved), not expenseDate or createdAt, same reasoning as
// financials' listPayments scoping by paidDate.

async function getExpenseReport(schoolId, { from, to, expenseItemId } = {}) {
  const where = { status: 'APPROVED', paymentStatus: 'PAID' };
  if (expenseItemId) where.expenseItemId = expenseItemId;
  if (from && to) where.paidDate = { [Op.between]: [from, to] };
  else if (from) where.paidDate = { [Op.gte]: from };
  else if (to) where.paidDate = { [Op.lte]: to };

  const expenses = await tenantScoped(ExpenseRequest, schoolId).findAll({
    where,
    include: REQUEST_INCLUDE,
    order: [['paidDate', 'DESC'], ['createdAt', 'DESC']],
  });

  const totalPesewas = expenses.reduce((sum, e) => sum + e.amountPesewas, 0);
  return { expenses, totalPesewas };
}

// ---- Analytics ----
// Same APPROVED-only, paidDate-scoped population as getExpenseReport (that's
// the definition of "recorded") — this just adds the breakdowns/trend a
// chart needs instead of a flat list. Mirrors financials/service.js's
// getPaymentAnalytics shape (byMethod + trend with a running cumulative
// total), swapping in expense-specific dimensions (byCategory, byExpenseItem)
// in place of the fee module's byLevel/byClass.

const CATEGORY_LABELS = {
  UTILITIES: 'Utilities', SUPPLIES: 'Supplies', MAINTENANCE: 'Maintenance', TRANSPORT: 'Transport', SALARIES: 'Salaries', OTHER: 'Other',
};
const METHOD_LABELS = {
  CASH: 'Cash', MOBILE_MONEY: 'Mobile money', BANK_TRANSFER: 'Bank transfer', OTHER: 'Other',
};

async function getExpenseAnalytics(schoolId, { from, to } = {}) {
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const expenses = await tenantScoped(ExpenseRequest, schoolId).findAll({
    where: { status: 'APPROVED', paymentStatus: 'PAID', paidDate: { [Op.between]: [from, to] } },
    include: [ExpenseItem],
    order: [['paidDate', 'ASC']],
  });

  let totalPesewas = 0;
  const byCategoryMap = new Map();
  const byItemMap = new Map();
  const byMethodMap = new Map();
  const byDateMap = new Map();

  for (const expense of expenses) {
    totalPesewas += expense.amountPesewas;

    const category = expense.ExpenseItem?.category || 'OTHER';
    const categoryEntry = byCategoryMap.get(category) || {
      category, label: CATEGORY_LABELS[category] || category, count: 0, totalPesewas: 0,
    };
    categoryEntry.count += 1;
    categoryEntry.totalPesewas += expense.amountPesewas;
    byCategoryMap.set(category, categoryEntry);

    const itemKey = expense.expenseItemId;
    const itemEntry = byItemMap.get(itemKey) || {
      expenseItemId: itemKey, name: expense.ExpenseItem?.name || 'Unknown', count: 0, totalPesewas: 0,
    };
    itemEntry.count += 1;
    itemEntry.totalPesewas += expense.amountPesewas;
    byItemMap.set(itemKey, itemEntry);

    const methodEntry = byMethodMap.get(expense.paymentMethod) || {
      method: expense.paymentMethod, label: METHOD_LABELS[expense.paymentMethod] || expense.paymentMethod, count: 0, totalPesewas: 0,
    };
    methodEntry.count += 1;
    methodEntry.totalPesewas += expense.amountPesewas;
    byMethodMap.set(expense.paymentMethod, methodEntry);

    const dateEntry = byDateMap.get(expense.paidDate) || { date: expense.paidDate, count: 0, totalPesewas: 0 };
    dateEntry.count += 1;
    dateEntry.totalPesewas += expense.amountPesewas;
    byDateMap.set(expense.paidDate, dateEntry);
  }

  const sortedDates = [...byDateMap.keys()].sort();
  let cumulativePesewas = 0;
  const trend = sortedDates.map((date) => {
    const entry = byDateMap.get(date);
    cumulativePesewas += entry.totalPesewas;
    return {
      date, count: entry.count, totalPesewas: entry.totalPesewas, cumulativePesewas,
    };
  });

  return {
    scope: { from, to },
    summary: {
      totalExpenses: expenses.length,
      totalPesewas,
      averagePesewas: expenses.length > 0 ? Math.round(totalPesewas / expenses.length) : 0,
    },
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.totalPesewas - a.totalPesewas),
    byExpenseItem: [...byItemMap.values()].sort((a, b) => b.totalPesewas - a.totalPesewas),
    byMethod: [...byMethodMap.values()].sort((a, b) => b.totalPesewas - a.totalPesewas),
    trend,
  };
}

module.exports = {
  listExpenseItems,
  createExpenseItem,
  updateExpenseItem,
  deleteExpenseItem,
  listExpenseRequests,
  createExpenseRequest,
  updateExpenseRequest,
  deleteExpenseRequest,
  approveExpenseRequest,
  markExpenseRequestPaid,
  rejectExpenseRequest,
  getExpenseReport,
  getExpenseAnalytics,
};
