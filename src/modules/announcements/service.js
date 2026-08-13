const { Op } = require('sequelize');
const { Announcement } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const resolveSchoolByCode = require('../../utils/resolveSchoolByCode');
const notificationsService = require('../notifications/service');

// Truncated to a preview — the full text is only a tap away on the
// announcements feed itself, and Notification.body caps at 500 chars.
function previewBody(body) {
  return body.length > 160 ? `${body.slice(0, 157)}...` : body;
}

// imagesJson is TEXT (see model comment) — every response hands back a
// parsed `images` array instead, dropping the raw column.
function present(announcement) {
  const { imagesJson, ...rest } = announcement.toJSON();
  return { ...rest, images: imagesJson ? JSON.parse(imagesJson) : [] };
}

async function list(schoolId) {
  const rows = await tenantScoped(Announcement, schoolId).findAll({ order: [['createdAt', 'DESC']] });
  return rows.map(present);
}

// Same query as list() today — kept as a separate entry point so the parent
// portal (read-only audience) doesn't call directly into the admin-facing
// list(), in case published/draft state is introduced later.
async function listPublished(schoolId) {
  return list(schoolId);
}

async function create(schoolId, userId, {
  title, body, images, ctaLabel, ctaUrl, startDate, endDate,
}) {
  const announcement = await tenantScoped(Announcement, schoolId).create({
    title,
    body,
    imagesJson: images && images.length ? JSON.stringify(images) : null,
    ctaLabel: ctaLabel || null,
    ctaUrl: ctaUrl || null,
    startDate: startDate || null,
    endDate: endDate || null,
    createdByUserId: userId,
  });
  await notificationsService.notifyRoles(schoolId, ['PARENT'], {
    type: 'ANNOUNCEMENT',
    title: announcement.title,
    body: previewBody(announcement.body),
    linkUrl: '/parent/dashboard',
  });
  return present(announcement);
}

async function update(schoolId, id, {
  title, body, images, ctaLabel, ctaUrl, startDate, endDate,
}) {
  const announcement = await tenantScoped(Announcement, schoolId).findByPk(id);
  if (!announcement) throw new ApiError(404, 'Announcement not found');
  await announcement.update({
    title,
    body,
    imagesJson: images && images.length ? JSON.stringify(images) : null,
    ctaLabel: ctaLabel || null,
    ctaUrl: ctaUrl || null,
    startDate: startDate || null,
    endDate: endDate || null,
  });
  return present(announcement);
}

async function remove(schoolId, id) {
  const announcement = await tenantScoped(Announcement, schoolId).findByPk(id);
  if (!announcement) throw new ApiError(404, 'Announcement not found');
  await announcement.destroy();
}

// Public, unauthenticated — announcements currently inside their
// startDate/endDate popup window, for the marketing site's daily popup. Both
// bounds are required (see model comment) so a plain dashboard announcement
// with neither set never leaks onto the public site.
async function listActivePublic(schoolCode) {
  const school = await resolveSchoolByCode(schoolCode);
  const today = new Date().toISOString().slice(0, 10);
  const rows = await tenantScoped(Announcement, school.id).findAll({
    where: { startDate: { [Op.lte]: today }, endDate: { [Op.gte]: today } },
    order: [['createdAt', 'DESC']],
  });
  return rows.map(present);
}

module.exports = {
  list, listPublished, create, update, remove, listActivePublic,
};
