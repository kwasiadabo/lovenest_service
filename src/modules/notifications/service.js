const {
  Notification, User, Role, StudentParent, Parent,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

async function createNotification(schoolId, userId, {
  type, title, body, linkUrl,
}) {
  return tenantScoped(Notification, schoolId).create({
    userId, type, title, body: body || null, linkUrl: linkUrl || null,
  });
}

// The fan-out primitive every trigger below funnels through — one row per
// recipient, so each user's read state is independent.
async function createNotifications(schoolId, userIds, {
  type, title, body, linkUrl,
}) {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return [];
  return tenantScoped(Notification, schoolId).bulkCreate(
    uniqueIds.map((userId) => ({
      userId, type, title, body: body || null, linkUrl: linkUrl || null,
    })),
  );
}

// Every User in this school holding any of roleNames — notifyRoles(schoolId,
// ['PARENT'], ...) is literally "every parent with a portal login" (a
// PARENT-role User is always 1:1 with a Parent row, see staff/service.js),
// so no separate Parent-table broadcast helper is needed.
async function notifyRoles(schoolId, roleNames, payload) {
  const users = await tenantScoped(User, schoolId).findAll({
    include: [{ model: Role, where: { name: roleNames }, through: { attributes: [] } }],
    attributes: ['id'],
  });
  return createNotifications(schoolId, users.map((u) => u.id), payload);
}

// A student's linked parents who actually have a portal login (userId not
// null) — parents without one can't see an in-app notification anyway.
async function notifyParentsOfStudent(schoolId, studentId, payload) {
  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId },
    include: [Parent],
  });
  const userIds = links.map((l) => l.Parent?.userId).filter(Boolean);
  return createNotifications(schoolId, userIds, payload);
}

// Capped at 100, not full pagination — same convention as the rest of this
// app (no list endpoint anywhere paginates yet); a bound this generous is
// cheap insurance against an unbounded fetch, not a real limit in practice.
async function listForUser(schoolId, userId) {
  return tenantScoped(Notification, schoolId).findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit: 100,
  });
}

async function markRead(schoolId, userId, notificationId) {
  const notification = await tenantScoped(Notification, schoolId).findOne({
    where: { id: notificationId, userId },
  });
  if (!notification) throw new ApiError(404, 'Notification not found');
  if (!notification.isRead) await notification.update({ isRead: true, readAt: new Date() });
  return notification;
}

async function markAllRead(schoolId, userId) {
  const [count] = await tenantScoped(Notification, schoolId).update(
    { isRead: true, readAt: new Date() },
    { where: { userId, isRead: false } },
  );
  return { markedCount: count };
}

module.exports = {
  createNotification,
  createNotifications,
  notifyRoles,
  notifyParentsOfStudent,
  listForUser,
  markRead,
  markAllRead,
};
