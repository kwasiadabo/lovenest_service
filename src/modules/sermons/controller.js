const service = require('./service');
const resolveImageUrls = require('../../utils/resolveImageUrls');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function payload(req, images) {
  const {
    title, scripture, speaker, body, date, ctaLabel, ctaUrl,
  } = req.body;
  return {
    title, scripture, speaker, body, date, images, ctaLabel, ctaUrl,
  };
}

const list = wrap(async (req, res) => {
  res.json(await service.list(req.schoolId));
});

const create = wrap(async (req, res) => {
  const images = await resolveImageUrls(req, 'sermons');
  res.status(201).json(await service.create(req.schoolId, req.auth.userId, payload(req, images)));
});

const update = wrap(async (req, res) => {
  const images = await resolveImageUrls(req, 'sermons');
  res.json(await service.update(req.schoolId, req.params.id, payload(req, images)));
});

const remove = wrap(async (req, res) => {
  await service.remove(req.schoolId, req.params.id);
  res.status(204).send();
});

module.exports = {
  list, create, update, remove,
};
