const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listRoles = wrap(async (req, res) => {
  res.json(await service.listSchoolRoles(req.schoolId));
});

const createRole = wrap(async (req, res) => {
  res.status(201).json(await service.createRole(req.schoolId, req.body));
});

const deleteRole = wrap(async (req, res) => {
  await service.deleteRole(req.schoolId, req.params.roleId);
  res.status(204).send();
});

module.exports = { listRoles, createRole, deleteRole };
