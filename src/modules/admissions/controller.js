const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listApplicants = wrap(async (req, res) => {
  res.json(await service.listApplicants(req.schoolId, { stage: req.query.stage }));
});

const shortlistApplicant = wrap(async (req, res) => {
  res.json(await service.shortlistApplicant(req.schoolId, req.params.id));
});

const rejectApplicant = wrap(async (req, res) => {
  res.json(await service.rejectApplicant(req.schoolId, req.params.id, req.body?.notes));
});

const acceptApplicant = wrap(async (req, res) => {
  res.json(await service.acceptApplicant(req.schoolId, req.params.id));
});

module.exports = {
  listApplicants,
  shortlistApplicant,
  rejectApplicant,
  acceptApplicant,
};
