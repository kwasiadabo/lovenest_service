const { Op } = require('sequelize');
const { Newsletter } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const notificationsService = require('../notifications/service');

// Truncated to a preview — the full text is only a tap away on the
// newsletters feed itself, and Notification.body caps at 500 chars.
function previewBody(body) {
  return body.length > 160 ? `${body.slice(0, 157)}...` : body;
}

async function list(schoolId) {
  return tenantScoped(Newsletter, schoolId).findAll({ order: [['publishedAt', 'DESC']] });
}

// Parents only ever see issues whose publishedAt has actually arrived —
// setting a future publishedAt lets a headmaster prepare an issue ahead of
// time without it appearing on the portal early.
async function listPublished(schoolId) {
  return tenantScoped(Newsletter, schoolId).findAll({
    where: { publishedAt: { [Op.lte]: new Date() } },
    order: [['publishedAt', 'DESC']],
  });
}

async function create(schoolId, userId, { title, body, publishedAt }) {
  const newsletter = await tenantScoped(Newsletter, schoolId).create({
    title, body, publishedAt: publishedAt || new Date(), createdByUserId: userId,
  });
  await notificationsService.notifyRoles(schoolId, ['PARENT'], {
    type: 'NEWSLETTER',
    title: newsletter.title,
    body: previewBody(newsletter.body),
    linkUrl: '/parent/newsletters',
  });
  return newsletter;
}

async function update(schoolId, id, { title, body, publishedAt }) {
  const newsletter = await tenantScoped(Newsletter, schoolId).findByPk(id);
  if (!newsletter) throw new ApiError(404, 'Newsletter not found');
  await newsletter.update({ title, body, publishedAt: publishedAt || newsletter.publishedAt });
  return newsletter;
}

async function remove(schoolId, id) {
  const newsletter = await tenantScoped(Newsletter, schoolId).findByPk(id);
  if (!newsletter) throw new ApiError(404, 'Newsletter not found');
  await newsletter.destroy();
}

module.exports = {
  list, listPublished, create, update, remove,
};
