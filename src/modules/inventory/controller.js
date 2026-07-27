const inventoryService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const isSchoolAdmin = (req) => (req.auth?.roles || []).includes('SCHOOL_ADMIN');

// ---- Inventory items ----

const listInventoryItems = wrap(async (req, res) => {
  res.json(await inventoryService.listInventoryItems(req.schoolId));
});

const createInventoryItem = wrap(async (req, res) => {
  res.status(201).json(await inventoryService.createInventoryItem(req.schoolId, req.body));
});

const updateInventoryItem = wrap(async (req, res) => {
  res.json(await inventoryService.updateInventoryItem(req.schoolId, req.params.id, req.body));
});

const deleteInventoryItem = wrap(async (req, res) => {
  await inventoryService.deleteInventoryItem(req.schoolId, req.params.id);
  res.status(204).send();
});

const restockInventoryItem = wrap(async (req, res) => {
  res.json(await inventoryService.restockInventoryItem(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const listStockMovements = wrap(async (req, res) => {
  res.json(await inventoryService.listStockMovements(req.schoolId, req.params.id));
});

const getInventoryAnalytics = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await inventoryService.getInventoryAnalytics(req.schoolId, { from, to }));
});

// ---- Inventory requests ----

const listInventoryRequests = wrap(async (req, res) => {
  const { status, inventoryItemId } = req.query;
  res.json(await inventoryService.listInventoryRequests(req.schoolId, { status, inventoryItemId }));
});

const getInventoryRequestsReport = wrap(async (req, res) => {
  const {
    from, to, status, inventoryItemId,
  } = req.query;
  res.json(await inventoryService.getInventoryRequestsReport(req.schoolId, {
    from, to, status, inventoryItemId,
  }));
});

const createInventoryRequest = wrap(async (req, res) => {
  res.status(201).json(await inventoryService.createInventoryRequest(req.schoolId, req.auth.userId, req.body));
});

const updateInventoryRequest = wrap(async (req, res) => {
  res.json(
    await inventoryService.updateInventoryRequest(req.schoolId, req.params.id, req.auth.userId, isSchoolAdmin(req), req.body),
  );
});

const deleteInventoryRequest = wrap(async (req, res) => {
  await inventoryService.deleteInventoryRequest(req.schoolId, req.params.id, req.auth.userId, isSchoolAdmin(req));
  res.status(204).send();
});

const approveInventoryRequest = wrap(async (req, res) => {
  res.json(await inventoryService.approveInventoryRequest(req.schoolId, req.params.id, req.auth.userId));
});

const rejectInventoryRequest = wrap(async (req, res) => {
  res.json(await inventoryService.rejectInventoryRequest(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const issueInventoryRequest = wrap(async (req, res) => {
  res.json(await inventoryService.issueInventoryRequest(req.schoolId, req.params.id, req.auth.userId));
});

module.exports = {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  restockInventoryItem,
  listStockMovements,
  getInventoryAnalytics,
  listInventoryRequests,
  getInventoryRequestsReport,
  createInventoryRequest,
  updateInventoryRequest,
  deleteInventoryRequest,
  approveInventoryRequest,
  rejectInventoryRequest,
  issueInventoryRequest,
};
