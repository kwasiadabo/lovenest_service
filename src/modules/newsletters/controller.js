const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const list = wrap(async (req, res) => {
  res.json(await service.list(req.schoolId));
});

const create = wrap(async (req, res) => {
  res.status(201).json(await service.create(req.schoolId, req.auth.userId, req.body));
});

const update = wrap(async (req, res) => {
  res.json(await service.update(req.schoolId, req.params.id, req.body));
});

const remove = wrap(async (req, res) => {
  await service.remove(req.schoolId, req.params.id);
  res.status(204).send();
});

module.exports = {
  list, create, update, remove,
};
