const { Op } = require('sequelize');
const {
  sequelize, InventoryItem, InventoryRequest, InventoryStockMovement, User,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

// Every User include in this file must be scoped to this — full User rows
// carry passwordHash/resetPasswordTokenHash, which must never reach the API
// response (same convention as expenses/service.js).
const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

const CATEGORY_LABELS = {
  UNIFORM: 'Uniform', TEXTBOOK: 'Textbook', STATIONERY: 'Stationery', OTHER: 'Other',
};
const STATUS_LABELS = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' };

// createdAt is a DATE (with time) column — a bare "to" date would exclude
// same-day records after midnight, same reasoning as health/service.js's
// dateTimeRangeWhere.
function dateTimeRangeWhere(column, from, to) {
  if (from && to) return { [column]: { [Op.between]: [`${from} 00:00:00`, `${to} 23:59:59`] } };
  if (from) return { [column]: { [Op.gte]: `${from} 00:00:00` } };
  if (to) return { [column]: { [Op.lte]: `${to} 23:59:59` } };
  return {};
}

// ---- Inventory items (setup + stock) ----

async function listInventoryItems(schoolId) {
  return tenantScoped(InventoryItem, schoolId).findAll({ order: [['category', 'ASC'], ['name', 'ASC']] });
}

async function createInventoryItem(schoolId, {
  name, category, unit, reorderLevel,
}) {
  return tenantScoped(InventoryItem, schoolId).create({
    name,
    category: category || 'OTHER',
    unit: unit || 'pcs',
    reorderLevel: reorderLevel !== undefined ? Number(reorderLevel) : 0,
  });
}

async function updateInventoryItem(schoolId, itemId, {
  name, category, unit, reorderLevel,
}) {
  const item = await tenantScoped(InventoryItem, schoolId).findByPk(itemId);
  if (!item) throw new ApiError(404, 'Inventory item not found');
  await item.update({
    name, category, unit, reorderLevel: reorderLevel !== undefined ? Number(reorderLevel) : item.reorderLevel,
  });
  return item;
}

// Removing an item also removes every request and movement recorded against
// it — there's no use for an orphaned InventoryRequest/InventoryStockMovement
// (same convention as expenses/service.js's deleteExpenseItem).
async function deleteInventoryItem(schoolId, itemId) {
  await sequelize.transaction(async (transaction) => {
    await tenantScoped(InventoryStockMovement, schoolId).destroy({ where: { inventoryItemId: itemId }, transaction });
    await tenantScoped(InventoryRequest, schoolId).destroy({ where: { inventoryItemId: itemId }, transaction });
    const deleted = await tenantScoped(InventoryItem, schoolId).destroy({ where: { id: itemId }, transaction });
    if (!deleted) throw new ApiError(404, 'Inventory item not found');
  });
}

// The only way stock increases — a fresh purchase/delivery landing in the
// store. Decreases only ever happen through issueInventoryRequest below, so
// every movement of currentStockQty traces back to a request or a restock,
// each logged as an InventoryStockMovement for the history view.
async function restockInventoryItem(schoolId, itemId, userId, { quantity, note }) {
  return sequelize.transaction(async (transaction) => {
    const item = await tenantScoped(InventoryItem, schoolId).findByPk(itemId, { transaction });
    if (!item) throw new ApiError(404, 'Inventory item not found');

    const balanceAfter = item.currentStockQty + Number(quantity);
    await item.update({ currentStockQty: balanceAfter }, { transaction });
    await tenantScoped(InventoryStockMovement, schoolId).create({
      inventoryItemId: itemId,
      type: 'RESTOCK',
      quantity: Number(quantity),
      balanceAfter,
      performedByUserId: userId,
      note: note || null,
    }, { transaction });

    return item;
  });
}

async function listStockMovements(schoolId, itemId) {
  const item = await tenantScoped(InventoryItem, schoolId).findByPk(itemId);
  if (!item) throw new ApiError(404, 'Inventory item not found');

  return tenantScoped(InventoryStockMovement, schoolId).findAll({
    where: { inventoryItemId: itemId },
    include: [
      { model: User, as: 'performedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: InventoryRequest, attributes: ['id', 'purpose'] },
    ],
    order: [['createdAt', 'DESC']],
  });
}

// ---- Reporting ----

// Low stock is a live snapshot (not date-scoped) — a school needs to know
// what to reorder today, not what was low during some past window.
async function getInventoryAnalytics(schoolId, { from, to } = {}) {
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const items = await tenantScoped(InventoryItem, schoolId).findAll();

  const lowStockItems = items
    .filter((item) => item.currentStockQty <= item.reorderLevel)
    .sort((a, b) => (a.currentStockQty - a.reorderLevel) - (b.currentStockQty - b.reorderLevel))
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      currentStockQty: item.currentStockQty,
      reorderLevel: item.reorderLevel,
    }));

  const requests = await tenantScoped(InventoryRequest, schoolId).findAll({
    where: dateTimeRangeWhere('createdAt', from, to),
    include: [InventoryItem],
  });

  const byStatusMap = new Map();
  const byRequestedItemMap = new Map();
  for (const request of requests) {
    const statusEntry = byStatusMap.get(request.status)
      || { status: request.status, label: STATUS_LABELS[request.status] || request.status, count: 0 };
    statusEntry.count += 1;
    byStatusMap.set(request.status, statusEntry);

    const itemEntry = byRequestedItemMap.get(request.inventoryItemId) || {
      inventoryItemId: request.inventoryItemId, name: request.InventoryItem?.name || 'Unknown', count: 0, quantity: 0,
    };
    itemEntry.count += 1;
    itemEntry.quantity += request.quantity;
    byRequestedItemMap.set(request.inventoryItemId, itemEntry);
  }

  const movements = await tenantScoped(InventoryStockMovement, schoolId).findAll({
    where: dateTimeRangeWhere('createdAt', from, to),
    include: [InventoryItem],
    order: [['createdAt', 'ASC']],
  });

  let totalIssuedQty = 0;
  let totalRestockedQty = 0;
  const byCategoryMap = new Map();
  const byDateMap = new Map();

  for (const movement of movements) {
    const category = movement.InventoryItem?.category || 'OTHER';
    const categoryEntry = byCategoryMap.get(category)
      || { category, label: CATEGORY_LABELS[category] || category, issuedQty: 0, restockedQty: 0 };

    const dateKey = movement.createdAt.toISOString().slice(0, 10);
    const dateEntry = byDateMap.get(dateKey) || { date: dateKey, issuedQty: 0, restockedQty: 0 };

    if (movement.type === 'ISSUE') {
      totalIssuedQty += movement.quantity;
      categoryEntry.issuedQty += movement.quantity;
      dateEntry.issuedQty += movement.quantity;
    } else {
      totalRestockedQty += movement.quantity;
      categoryEntry.restockedQty += movement.quantity;
      dateEntry.restockedQty += movement.quantity;
    }

    byCategoryMap.set(category, categoryEntry);
    byDateMap.set(dateKey, dateEntry);
  }

  const sortedDates = [...byDateMap.keys()].sort();
  let cumulativeIssuedQty = 0;
  let cumulativeRestockedQty = 0;
  const trend = sortedDates.map((date) => {
    const entry = byDateMap.get(date);
    cumulativeIssuedQty += entry.issuedQty;
    cumulativeRestockedQty += entry.restockedQty;
    return {
      date, issuedQty: entry.issuedQty, restockedQty: entry.restockedQty, cumulativeIssuedQty, cumulativeRestockedQty,
    };
  });

  return {
    scope: { from, to },
    summary: {
      totalItems: items.length,
      lowStockCount: lowStockItems.length,
      totalRequests: requests.length,
      pendingRequests: byStatusMap.get('PENDING')?.count || 0,
      totalIssuedQty,
      totalRestockedQty,
    },
    lowStockItems,
    byStatus: [...byStatusMap.values()],
    byRequestedItem: [...byRequestedItemMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    byCategory: [...byCategoryMap.values()],
    trend,
  };
}

// ---- Inventory requests (workflow) ----

const REQUEST_INCLUDE = [
  InventoryItem,
  { model: User, as: 'requestedBy', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: User, as: 'reviewedBy', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: User, as: 'issuedBy', attributes: USER_SUMMARY_ATTRIBUTES },
];

async function listInventoryRequests(schoolId, { status, inventoryItemId } = {}) {
  const where = {};
  if (status) where.status = status;
  if (inventoryItemId) where.inventoryItemId = inventoryItemId;

  return tenantScoped(InventoryRequest, schoolId).findAll({
    where,
    include: REQUEST_INCLUDE,
    order: [['createdAt', 'DESC']],
  });
}

// Printable/exportable record of requests over a date range — same shape of
// concern as expenses/service.js's getExpenseReport (a flat list + a total),
// just scoped by createdAt instead of a paidDate since a request has no
// "paid" analogue.
async function getInventoryRequestsReport(schoolId, {
  from, to, status, inventoryItemId,
} = {}) {
  const where = { ...dateTimeRangeWhere('createdAt', from, to) };
  if (status) where.status = status;
  if (inventoryItemId) where.inventoryItemId = inventoryItemId;

  const requests = await tenantScoped(InventoryRequest, schoolId).findAll({
    where,
    include: REQUEST_INCLUDE,
    order: [['createdAt', 'DESC']],
  });

  const totalQuantity = requests.reduce((sum, request) => sum + request.quantity, 0);
  return { requests, totalQuantity };
}

async function createInventoryRequest(schoolId, userId, { inventoryItemId, quantity, purpose }) {
  const item = await tenantScoped(InventoryItem, schoolId).findByPk(inventoryItemId);
  if (!item) throw new ApiError(404, 'Inventory item not found');

  const request = await tenantScoped(InventoryRequest, schoolId).create({
    inventoryItemId,
    quantity,
    purpose,
    requestedByUserId: userId,
    status: 'PENDING',
  });

  return tenantScoped(InventoryRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

// A requester may fix their own not-yet-decided request; SCHOOL_ADMIN can
// override anyone's — the route-level role guard alone can't express "your
// own request", so that ownership check lives here (mirrors
// expenses/service.js's assertCanModify).
function assertCanModify(request, userId, isSchoolAdmin) {
  if (!request) throw new ApiError(404, 'Inventory request not found');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be edited or cancelled');
  if (request.requestedByUserId !== userId && !isSchoolAdmin) {
    throw new ApiError(403, 'You can only edit or cancel your own request');
  }
}

async function updateInventoryRequest(schoolId, requestId, userId, isSchoolAdmin, {
  inventoryItemId, quantity, purpose,
}) {
  const request = await tenantScoped(InventoryRequest, schoolId).findByPk(requestId);
  assertCanModify(request, userId, isSchoolAdmin);

  const item = await tenantScoped(InventoryItem, schoolId).findByPk(inventoryItemId);
  if (!item) throw new ApiError(404, 'Inventory item not found');

  await request.update({ inventoryItemId, quantity, purpose });
  return tenantScoped(InventoryRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

async function deleteInventoryRequest(schoolId, requestId, userId, isSchoolAdmin) {
  const request = await tenantScoped(InventoryRequest, schoolId).findByPk(requestId);
  if (!request) throw new ApiError(404, 'Inventory request not found');

  if (request.status === 'PENDING') {
    assertCanModify(request, userId, isSchoolAdmin);
  } else if (request.status === 'APPROVED') {
    if (!isSchoolAdmin) throw new ApiError(403, 'Only a school admin can delete an approved request');
    if (request.fulfilmentStatus === 'ISSUED') {
      throw new ApiError(400, 'This request has already been issued and cannot be deleted — the stock has left the store');
    }
  } else {
    throw new ApiError(400, 'A rejected request cannot be deleted');
  }

  await tenantScoped(InventoryRequest, schoolId).destroy({ where: { id: requestId } });
}

async function approveInventoryRequest(schoolId, requestId, userId) {
  const request = await tenantScoped(InventoryRequest, schoolId).findByPk(requestId);
  if (!request) throw new ApiError(404, 'Inventory request not found');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be approved');
  if (request.requestedByUserId === userId) {
    throw new ApiError(403, 'You cannot approve your own request — another approver must act on it');
  }

  await request.update({
    status: 'APPROVED',
    reviewedByUserId: userId,
    reviewedAt: new Date(),
  });
  return tenantScoped(InventoryRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

async function rejectInventoryRequest(schoolId, requestId, userId, { rejectionReason }) {
  const request = await tenantScoped(InventoryRequest, schoolId).findByPk(requestId);
  if (!request) throw new ApiError(404, 'Inventory request not found');
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
  return tenantScoped(InventoryRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

// The step where stock actually leaves the store — separate from approval
// the same way markExpenseRequestPaid is separate from approveExpenseRequest,
// so "authorized" and "physically handed over" stay two distinct events.
async function issueInventoryRequest(schoolId, requestId, userId) {
  const request = await tenantScoped(InventoryRequest, schoolId).findByPk(requestId);
  if (!request) throw new ApiError(404, 'Inventory request not found');
  if (request.status !== 'APPROVED') throw new ApiError(400, 'Only an approved request can be issued');
  if (request.fulfilmentStatus === 'ISSUED') throw new ApiError(400, 'This request has already been issued');

  await sequelize.transaction(async (transaction) => {
    const item = await tenantScoped(InventoryItem, schoolId).findByPk(request.inventoryItemId, { transaction });
    if (!item) throw new ApiError(404, 'Inventory item not found');
    if (item.currentStockQty < request.quantity) {
      throw new ApiError(400, `Insufficient stock — only ${item.currentStockQty} ${item.unit} of "${item.name}" left`);
    }

    const balanceAfter = item.currentStockQty - request.quantity;
    await item.update({ currentStockQty: balanceAfter }, { transaction });
    await request.update({
      fulfilmentStatus: 'ISSUED',
      issuedAt: new Date(),
      issuedByUserId: userId,
    }, { transaction });
    await tenantScoped(InventoryStockMovement, schoolId).create({
      inventoryItemId: item.id,
      type: 'ISSUE',
      quantity: request.quantity,
      balanceAfter,
      inventoryRequestId: request.id,
      performedByUserId: userId,
    }, { transaction });
  });

  return tenantScoped(InventoryRequest, schoolId).findByPk(request.id, { include: REQUEST_INCLUDE });
}

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
