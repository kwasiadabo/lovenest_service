const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const list = wrap(async (req, res) => {
  res.json(await service.listIssuesForStaff(req.schoolId, { status: req.query.status }));
});

const get = wrap(async (req, res) => {
  res.json(await service.getIssueForStaff(req.schoolId, req.params.id));
});

const addMessage = wrap(async (req, res) => {
  res.status(201).json(await service.addStaffMessage(req.schoolId, req.auth.userId, req.params.id, req.body.body));
});

const updateStatus = wrap(async (req, res) => {
  res.json(await service.updateIssueStatus(req.schoolId, req.params.id, req.body.status));
});

module.exports = {
  list, get, addMessage, updateStatus,
};
