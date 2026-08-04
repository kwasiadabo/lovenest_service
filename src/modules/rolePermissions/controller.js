const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getPermissions = wrap(async (req, res) => {
  res.json(await service.getPermissions(req.schoolId));
});

const updatePermissions = wrap(async (req, res) => {
  res.json(await service.updatePermissions(req.schoolId, req.body.permissions));
});

const getMyPermissions = wrap(async (req, res) => {
  res.json(await service.getMyPermissions(req.schoolId, req.auth.roles));
});

module.exports = { getPermissions, updatePermissions, getMyPermissions };
