const schoolSettingsService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getSettings = wrap(async (req, res) => {
  res.json(await schoolSettingsService.getSettings(req.schoolId));
});

const updateSettings = wrap(async (req, res) => {
  res.json(await schoolSettingsService.updateSettings(req.schoolId, req.body));
});

module.exports = { getSettings, updateSettings };
