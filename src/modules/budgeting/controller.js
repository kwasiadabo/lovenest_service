const budgetingService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listBudgets = wrap(async (req, res) => {
  res.json(await budgetingService.listBudgets(req.schoolId));
});

const getBudget = wrap(async (req, res) => {
  res.json(await budgetingService.getBudget(req.schoolId, req.params.id));
});

const createBudget = wrap(async (req, res) => {
  res.status(201).json(await budgetingService.createBudget(req.schoolId, req.auth.userId, req.body));
});

const updateBudget = wrap(async (req, res) => {
  res.json(await budgetingService.updateBudget(req.schoolId, req.params.id, req.body));
});

const approveBudget = wrap(async (req, res) => {
  res.json(await budgetingService.approveBudget(req.schoolId, req.params.id, req.auth.userId));
});

const getBudgetVsActual = wrap(async (req, res) => {
  res.json(await budgetingService.getBudgetVsActual(req.schoolId, req.params.id));
});

module.exports = {
  listBudgets, getBudget, createBudget, updateBudget, approveBudget, getBudgetVsActual,
};
