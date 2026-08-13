const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getToday = wrap(async (req, res) => {
  res.json(await service.getTodaysPublic(req.params.schoolCode));
});

module.exports = { getToday };
