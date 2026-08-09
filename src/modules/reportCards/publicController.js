const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const verify = wrap(async (req, res) => {
  res.json(await service.getPublicVerification(req.params.id));
});

module.exports = { verify };
