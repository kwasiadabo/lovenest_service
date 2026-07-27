const { Announcement } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const notificationsService = require('../notifications/service');

// Truncated to a preview — the full text is only a tap away on the
// announcements feed itself, and Notification.body caps at 500 chars.
function previewBody(body) {
  return body.length > 160 ? `${body.slice(0, 157)}...` : body;
}

async function list(schoolId) {
  return tenantScoped(Announcement, schoolId).findAll({ order: [['createdAt', 'DESC']] });
}

// Same query as list() today — kept as a separate entry point so the parent
// portal (read-only audience) doesn't call directly into the admin-facing
// list(), in case published/draft state is introduced later.
async function listPublished(schoolId) {
  return list(schoolId);
}

async function create(schoolId, userId, { title, body }) {
  const announcement = await tenantScoped(Announcement, schoolId).create({ title, body, createdByUserId: userId });
  await notificationsService.notifyRoles(schoolId, ['PARENT'], {
    type: 'ANNOUNCEMENT',
    title: announcement.title,
    body: previewBody(announcement.body),
    linkUrl: '/parent/dashboard',
  });
  return announcement;
}

async function update(schoolId, id, { title, body }) {
  const announcement = await tenantScoped(Announcement, schoolId).findByPk(id);
  if (!announcement) throw new ApiError(404, 'Announcement not found');
  await announcement.update({ title, body });
  return announcement;
}

async function remove(schoolId, id) {
  const announcement = await tenantScoped(Announcement, schoolId).findByPk(id);
  if (!announcement) throw new ApiError(404, 'Announcement not found');
  await announcement.destroy();
}

module.exports = {
  list, listPublished, create, update, remove,
};
