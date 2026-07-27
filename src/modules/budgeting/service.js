const { Op } = require('sequelize');
const {
  sequelize, Budget, BudgetLine, Account, AcademicYear, Term, JournalEntry, JournalLine,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

const BUDGET_INCLUDE = [
  { model: BudgetLine, as: 'lines', include: [{ model: Account, as: 'account' }, Term] },
  { model: AcademicYear },
];

async function replaceBudgetLines(schoolId, budgetId, lines, transaction) {
  await tenantScoped(BudgetLine, schoolId).destroy({ where: { budgetId }, transaction });
  if (lines?.length) {
    await tenantScoped(BudgetLine, schoolId).bulkCreate(
      lines.map((line) => ({
        budgetId,
        accountId: line.accountId,
        termId: line.termId || null,
        budgetedAmountPesewas: line.budgetedAmountPesewas,
        notes: line.notes || null,
      })),
      { transaction },
    );
  }
}

async function listBudgets(schoolId) {
  return tenantScoped(Budget, schoolId).findAll({ order: [['createdAt', 'DESC']] });
}

async function getBudget(schoolId, budgetId) {
  const budget = await tenantScoped(Budget, schoolId).findByPk(budgetId, { include: BUDGET_INCLUDE });
  if (!budget) throw new ApiError(404, 'Budget not found');
  return budget;
}

async function createBudget(schoolId, userId, { academicYearId, name, lines }) {
  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  const budgetId = await sequelize.transaction(async (transaction) => {
    const budget = await tenantScoped(Budget, schoolId).create({
      academicYearId, name, status: 'DRAFT', createdByUserId: userId,
    }, { transaction });
    await replaceBudgetLines(schoolId, budget.id, lines, transaction);
    return budget.id;
  });
  return getBudget(schoolId, budgetId);
}

async function updateBudget(schoolId, budgetId, { name, lines }) {
  const budget = await tenantScoped(Budget, schoolId).findByPk(budgetId);
  if (!budget) throw new ApiError(404, 'Budget not found');
  if (budget.status !== 'DRAFT') throw new ApiError(400, 'Only a draft budget can be edited');

  await sequelize.transaction(async (transaction) => {
    await budget.update({ name }, { transaction });
    await replaceBudgetLines(schoolId, budget.id, lines, transaction);
  });
  return getBudget(schoolId, budgetId);
}

async function approveBudget(schoolId, budgetId, userId) {
  const budget = await tenantScoped(Budget, schoolId).findByPk(budgetId);
  if (!budget) throw new ApiError(404, 'Budget not found');
  if (budget.status !== 'DRAFT') throw new ApiError(400, 'Only a draft budget can be approved');

  await budget.update({ status: 'APPROVED', approvedByUserId: userId, approvedAt: new Date() });
  return getBudget(schoolId, budgetId);
}

// "Actual" is never stored — always a live sum over JournalLine for the
// line's account, scoped to the line's term (or the whole academic year if
// termId is null), same "computed, not materialized" philosophy as
// computeStudentBalancePesewas and the rest of the accounting subsystem.
async function getActualForLine(schoolId, line, budget) {
  const period = line.termId
    ? await tenantScoped(Term, schoolId).findByPk(line.termId)
    : budget.AcademicYear;
  if (!period) return 0;

  const rows = await tenantScoped(JournalLine, schoolId).findAll({
    attributes: [
      [sequelize.fn('SUM', sequelize.col('JournalLine.debitPesewas')), 'totalDebit'],
      [sequelize.fn('SUM', sequelize.col('JournalLine.creditPesewas')), 'totalCredit'],
    ],
    where: { accountId: line.accountId },
    include: [{
      model: JournalEntry,
      as: 'journalEntry',
      where: { entryDate: { [Op.between]: [period.startDate, period.endDate] } },
      attributes: [],
    }],
    raw: true,
  });
  const totalDebit = Number(rows[0]?.totalDebit || 0);
  const totalCredit = Number(rows[0]?.totalCredit || 0);
  return line.account.normalBalance === 'DEBIT' ? totalDebit - totalCredit : totalCredit - totalDebit;
}

async function getBudgetVsActual(schoolId, budgetId) {
  const budget = await getBudget(schoolId, budgetId);

  const rows = await Promise.all(budget.lines.map(async (line) => {
    const actualPesewas = await getActualForLine(schoolId, line, budget);
    return {
      id: line.id,
      accountId: line.accountId,
      accountCode: line.account.code,
      accountName: line.account.name,
      termId: line.termId,
      termName: line.Term?.name || 'Full year',
      budgetedAmountPesewas: line.budgetedAmountPesewas,
      actualPesewas,
      variancePesewas: line.budgetedAmountPesewas - actualPesewas,
    };
  }));

  return {
    budget: { id: budget.id, name: budget.name, status: budget.status },
    rows,
    totalBudgetedPesewas: rows.reduce((sum, r) => sum + r.budgetedAmountPesewas, 0),
    totalActualPesewas: rows.reduce((sum, r) => sum + r.actualPesewas, 0),
  };
}

module.exports = {
  listBudgets, getBudget, createBudget, updateBudget, approveBudget, getBudgetVsActual,
};
