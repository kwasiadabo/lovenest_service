const { Op } = require('sequelize');
const {
  sequelize, Account, JournalEntry, JournalLine, Term,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

// Single entry point for every double-entry posting in the system — every
// module (financials, levies, expenses, students/admissions, payroll,
// fixedAssets, budgeting) posts through this file rather than writing
// JournalEntry/JournalLine rows directly, so the balance invariant and the
// reversal mechanism only ever live in one place.

// A SQL MAX() aggregate rather than pulling every entryNumber ever posted
// for the school into Node to reduce over — journal_entries has a unique
// (schoolId, entryNumber) index, so this is an indexed lookup regardless of
// how much history has accumulated, unlike the old full-table-scan-per-post
// version (which every single journal posting paid the cost of, inside the
// write transaction). Safe because entryNumber is always the same
// zero-padded width ("JE-000001"), so lexicographic MAX matches numeric MAX.
async function generateEntryNumber(schoolId, transaction) {
  // findAll (not findOne) deliberately — findOne implies limit: 1, and
  // Sequelize's mssql query generator force-adds "ORDER BY [id]" to any
  // limited query when no order is given (even order: [] — it checks
  // order.length === 0 and treats that the same as "no order"), which SQL
  // Server rejects on a bare aggregate with no GROUP BY. A MAX() with no
  // GROUP BY always collapses to exactly one row anyway, so no limit is
  // needed at all — same fix as financials/service.js#generateReceiptNumber.
  const [result] = await tenantScoped(JournalEntry, schoolId).findAll({
    attributes: [[sequelize.fn('MAX', sequelize.col('entryNumber')), 'maxEntryNumber']],
    transaction,
    raw: true,
  });
  const match = /^JE-(\d+)$/.exec(result?.maxEntryNumber || '');
  const maxNumber = match ? Number(match[1]) : 0;
  return `JE-${String(maxNumber + 1).padStart(6, '0')}`;
}

// Best-effort: resolves which Term (and its AcademicYear) an entryDate falls
// inside, purely for statement period-filtering. Returns nulls if the date
// doesn't land inside any defined term (e.g. a payment recorded before terms
// were set up) — never blocks posting.
async function resolvePeriod(schoolId, entryDate, transaction) {
  const term = await tenantScoped(Term, schoolId).findOne({
    where: { startDate: { [Op.lte]: entryDate }, endDate: { [Op.gte]: entryDate } },
    transaction,
  });
  return { academicYearId: term ? term.academicYearId : null, termId: term ? term.id : null };
}

async function resolveAccountId(schoolId, line, transaction) {
  if (line.accountId) return line.accountId;
  if (!line.accountCode) throw new ApiError(500, 'Journal line is missing accountId/accountCode');
  const account = await tenantScoped(Account, schoolId).findOne({
    where: { code: line.accountCode },
    transaction,
  });
  if (!account) throw new ApiError(500, `Chart of Accounts is missing account code ${line.accountCode}`);
  return account.id;
}

// lines: [{ accountId | accountCode, debitPesewas, creditPesewas, description, studentId, staffId }]
async function postJournalEntry(schoolId, {
  entryDate, description, sourceType, sourceId, lines, userId,
}, transaction) {
  if (!lines || lines.length < 2) {
    throw new ApiError(400, 'A journal entry needs at least two lines');
  }

  const resolvedLines = await Promise.all(lines.map(async (line, index) => {
    const debitPesewas = Math.round(line.debitPesewas || 0);
    const creditPesewas = Math.round(line.creditPesewas || 0);
    if (debitPesewas > 0 && creditPesewas > 0) {
      throw new ApiError(400, 'A journal line cannot have both a debit and a credit');
    }
    if (debitPesewas === 0 && creditPesewas === 0) {
      throw new ApiError(400, 'A journal line must have a non-zero debit or credit');
    }
    return {
      accountId: await resolveAccountId(schoolId, line, transaction),
      debitPesewas,
      creditPesewas,
      description: line.description || null,
      studentId: line.studentId || null,
      staffId: line.staffId || null,
      lineOrder: index,
    };
  }));

  const totalDebit = resolvedLines.reduce((sum, l) => sum + l.debitPesewas, 0);
  const totalCredit = resolvedLines.reduce((sum, l) => sum + l.creditPesewas, 0);
  if (totalDebit !== totalCredit) {
    throw new ApiError(400, `Journal entry is not balanced (debit ${totalDebit} !== credit ${totalCredit})`);
  }

  const entryNumber = await generateEntryNumber(schoolId, transaction);
  const { academicYearId, termId } = await resolvePeriod(schoolId, entryDate, transaction);

  const entry = await tenantScoped(JournalEntry, schoolId).create({
    entryNumber,
    entryDate,
    description,
    sourceType,
    sourceId: sourceId || null,
    status: 'POSTED',
    academicYearId,
    termId,
    createdByUserId: userId || null,
    postedAt: new Date(),
  }, { transaction });

  await tenantScoped(JournalLine, schoolId).bulkCreate(
    resolvedLines.map((line) => ({ ...line, journalEntryId: entry.id })),
    { transaction },
  );

  return tenantScoped(JournalEntry, schoolId).findByPk(entry.id, {
    include: [{ model: JournalLine, as: 'lines' }],
    transaction,
  });
}

async function getActiveEntryFor(schoolId, sourceType, sourceId, transaction) {
  return tenantScoped(JournalEntry, schoolId).findOne({
    where: { sourceType, sourceId, status: 'POSTED' },
    include: [{ model: JournalLine, as: 'lines' }],
    order: [['postedAt', 'DESC']],
    transaction,
  });
}

// The single mechanism used for every "edit" or "delete" of an
// already-posted transaction: mirrors the active entry's lines with
// debit/credit flipped into a brand-new entry, and marks the original
// REVERSED. Never mutates a posted entry in place, matching the codebase's
// existing "append a revision, don't rewrite history" convention
// (BillPaymentRevision, LevyPaymentRevision).
async function reverseEntryFor(schoolId, sourceType, sourceId, { userId, reason }, transaction) {
  const original = await getActiveEntryFor(schoolId, sourceType, sourceId, transaction);
  if (!original) return null;

  const reversal = await postJournalEntry(schoolId, {
    entryDate: original.entryDate,
    description: reason ? `Reversal of ${original.entryNumber}: ${reason}` : `Reversal of ${original.entryNumber}`,
    sourceType,
    sourceId,
    userId,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debitPesewas: line.creditPesewas,
      creditPesewas: line.debitPesewas,
      description: line.description,
      studentId: line.studentId,
      staffId: line.staffId,
    })),
  }, transaction);

  await reversal.update({ reversalOfEntryId: original.id }, { transaction });
  await tenantScoped(JournalEntry, schoolId).update(
    { status: 'REVERSED' },
    { where: { id: original.id }, transaction },
  );

  return reversal;
}

// Used only by manual journal entries, which have no natural sourceType/
// sourceId pair to look up by (see accounting/service.js#updateJournalEntry)
// — the entry's own id is already known, so this skips the lookup.
async function reverseEntryById(schoolId, journalEntryId, { userId, reason }, transaction) {
  const original = await tenantScoped(JournalEntry, schoolId).findByPk(journalEntryId, {
    include: [{ model: JournalLine, as: 'lines' }],
    transaction,
  });
  if (!original) throw new ApiError(404, 'Journal entry not found');
  if (original.status !== 'POSTED') throw new ApiError(400, 'Only a posted journal entry can be reversed');

  const reversal = await postJournalEntry(schoolId, {
    entryDate: original.entryDate,
    description: reason ? `Reversal of ${original.entryNumber}: ${reason}` : `Reversal of ${original.entryNumber}`,
    sourceType: original.sourceType,
    sourceId: original.sourceId,
    userId,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debitPesewas: line.creditPesewas,
      creditPesewas: line.debitPesewas,
      description: line.description,
      studentId: line.studentId,
      staffId: line.staffId,
    })),
  }, transaction);

  await reversal.update({ reversalOfEntryId: original.id }, { transaction });
  await original.update({ status: 'REVERSED' }, { transaction });

  return reversal;
}

module.exports = {
  postJournalEntry,
  reverseEntryFor,
  reverseEntryById,
  getActiveEntryFor,
  resolveAccountId,
  sequelize,
};
