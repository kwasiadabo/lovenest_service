const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listActive = wrap(async (req, res) => {
  res.json(await service.listActivePublic(req.params.schoolCode));
});

module.exports = { listActive };
