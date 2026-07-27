const expensesService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const isSchoolAdmin = (req) => (req.auth?.roles || []).includes('SCHOOL_ADMIN');

// ---- Expense items ----

const listExpenseItems = wrap(async (req, res) => {
  res.json(await expensesService.listExpenseItems(req.schoolId));
});

const createExpenseItem = wrap(async (req, res) => {
  res.status(201).json(await expensesService.createExpenseItem(req.schoolId, req.body));
});

const updateExpenseItem = wrap(async (req, res) => {
  res.json(await expensesService.updateExpenseItem(req.schoolId, req.params.id, req.body));
});

const deleteExpenseItem = wrap(async (req, res) => {
  await expensesService.deleteExpenseItem(req.schoolId, req.params.id);
  res.status(204).send();
});

// ---- Expense requests ----

const listExpenseRequests = wrap(async (req, res) => {
  const {
    status, expenseItemId, from, to,
  } = req.query;
  res.json(await expensesService.listExpenseRequests(req.schoolId, {
    status, expenseItemId, from, to,
  }));
});

const createExpenseRequest = wrap(async (req, res) => {
  res.status(201).json(await expensesService.createExpenseRequest(req.schoolId, req.auth.userId, req.body));
});

const updateExpenseRequest = wrap(async (req, res) => {
  res.json(
    await expensesService.updateExpenseRequest(req.schoolId, req.params.id, req.auth.userId, isSchoolAdmin(req), req.body),
  );
});

const deleteExpenseRequest = wrap(async (req, res) => {
  await expensesService.deleteExpenseRequest(req.schoolId, req.params.id, req.auth.userId, isSchoolAdmin(req));
  res.status(204).send();
});

const approveExpenseRequest = wrap(async (req, res) => {
  res.json(await expensesService.approveExpenseRequest(req.schoolId, req.params.id, req.auth.userId));
});

const markExpenseRequestPaid = wrap(async (req, res) => {
  res.json(await expensesService.markExpenseRequestPaid(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const rejectExpenseRequest = wrap(async (req, res) => {
  res.json(await expensesService.rejectExpenseRequest(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const getExpenseReport = wrap(async (req, res) => {
  const { from, to, expenseItemId } = req.query;
  res.json(await expensesService.getExpenseReport(req.schoolId, { from, to, expenseItemId }));
});

const getExpenseAnalytics = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await expensesService.getExpenseAnalytics(req.schoolId, { from, to }));
});

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
