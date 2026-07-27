const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const list = wrap(async (req, res) => {
  res.json(await service.listForUser(req.schoolId, req.auth.userId));
});

const markRead = wrap(async (req, res) => {
  res.json(await service.markRead(req.schoolId, req.auth.userId, req.params.id));
});

const markAllRead = wrap(async (req, res) => {
  res.json(await service.markAllRead(req.schoolId, req.auth.userId));
});

module.exports = { list, markRead, markAllRead };
