const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listMyLeaveRequests = wrap(async (req, res) => {
  res.json(await service.listMyLeaveRequests(req.schoolId, req.auth.userId));
});

const createMyLeaveRequest = wrap(async (req, res) => {
  res.status(201).json(await service.createMyLeaveRequest(req.schoolId, req.auth.userId, req.body));
});

const listStaffLeaveRequests = wrap(async (req, res) => {
  res.json(await service.listStaffLeaveRequests(req.schoolId, req.params.staffId));
});

const updateLeaveRequestStatus = wrap(async (req, res) => {
  res.json(await service.updateLeaveRequestStatus(req.schoolId, req.params.id, req.auth.userId, req.body));
});

module.exports = {
  listMyLeaveRequests,
  createMyLeaveRequest,
  listStaffLeaveRequests,
  updateLeaveRequestStatus,
};
