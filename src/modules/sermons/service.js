const { Sermon } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const resolveSchoolByCode = require('../../utils/resolveSchoolByCode');

// imagesJson is TEXT (see model comment) — every response hands back a
// parsed `images` array instead, dropping the raw column.
function present(sermon) {
  const { imagesJson, ...rest } = sermon.toJSON();
  return { ...rest, images: imagesJson ? JSON.parse(imagesJson) : [] };
}

async function list(schoolId) {
  const rows = await tenantScoped(Sermon, schoolId).findAll({ order: [['date', 'DESC']] });
  return rows.map(present);
}

// Same query as list() today — kept as a separate entry point (matching
// announcements/newsletters) so the parent portal doesn't call directly
// into the admin-facing list(), in case draft/scheduled-only state is
// introduced later.
async function listPublished(schoolId) {
  return list(schoolId);
}

async function create(schoolId, userId, {
  title, scripture, speaker, body, date, images, ctaLabel, ctaUrl,
}) {
  const sermon = await tenantScoped(Sermon, schoolId).create({
    title,
    scripture: scripture || null,
    speaker: speaker || null,
    body,
    date,
    imagesJson: images && images.length ? JSON.stringify(images) : null,
    ctaLabel: ctaLabel || null,
    ctaUrl: ctaUrl || null,
    createdByUserId: userId,
  });
  return present(sermon);
}

async function update(schoolId, id, {
  title, scripture, speaker, body, date, images, ctaLabel, ctaUrl,
}) {
  const sermon = await tenantScoped(Sermon, schoolId).findByPk(id);
  if (!sermon) throw new ApiError(404, 'Sermon not found');
  await sermon.update({
    title,
    scripture: scripture || null,
    speaker: speaker || null,
    body,
    date,
    imagesJson: images && images.length ? JSON.stringify(images) : null,
    ctaLabel: ctaLabel || null,
    ctaUrl: ctaUrl || null,
  });
  return present(sermon);
}

async function remove(schoolId, id) {
  const sermon = await tenantScoped(Sermon, schoolId).findByPk(id);
  if (!sermon) throw new ApiError(404, 'Sermon not found');
  await sermon.destroy();
}

// Public, unauthenticated — the sermon featured for today, for the
// marketing site's daily popup. If more than one sermon happens to share
// today's date, the most recently edited one wins.
async function getTodaysPublic(schoolCode) {
  const school = await resolveSchoolByCode(schoolCode);
  const today = new Date().toISOString().slice(0, 10);
  const sermon = await tenantScoped(Sermon, school.id).findOne({
    where: { date: today },
    order: [['updatedAt', 'DESC']],
  });
  return sermon ? present(sermon) : null;
}

module.exports = {
  list, listPublished, create, update, remove, getTodaysPublic,
};
