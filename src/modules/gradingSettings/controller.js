const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getGradingSettings = wrap(async (req, res) => {
  res.json(await service.resolveGradingConfig(req.schoolId));
});

const updateWeights = wrap(async (req, res) => {
  res.json(await service.updateWeights(req.schoolId, req.body));
});

const updateGradeBands = wrap(async (req, res) => {
  res.json(await service.updateGradeBands(req.schoolId, req.body.bands));
});

const updateClassworkSource = wrap(async (req, res) => {
  res.json(await service.updateClassworkSource(req.schoolId, req.body));
});

const updateAssessmentSettings = wrap(async (req, res) => {
  res.json(await service.updateAssessmentSettings(req.schoolId, req.body));
});

module.exports = {
  getGradingSettings, updateWeights, updateGradeBands, updateClassworkSource, updateAssessmentSettings,
};
