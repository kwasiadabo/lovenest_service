const staffService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listStaff = wrap(async (req, res) => {
  res.json(await staffService.listStaff(req.schoolId));
});

const createStaffMember = wrap(async (req, res) => {
  res.status(201).json(await staffService.createStaffMember(req.schoolId, req.body));
});

const updateStaffMember = wrap(async (req, res) => {
  res.json(await staffService.updateStaffMember(req.schoolId, req.params.staffId, req.body));
});

const deleteStaffMember = wrap(async (req, res) => {
  await staffService.deleteStaffMember(req.schoolId, req.params.staffId);
  res.status(204).send();
});

const listUnlinkedUsers = wrap(async (req, res) => {
  res.json(await staffService.listUnlinkedNonParentUsers(req.schoolId));
});

const createLogin = wrap(async (req, res) => {
  res.status(201).json(await staffService.createStaffLogin(req.schoolId, req.params.staffId, req.body.roles));
});

const resetLoginPassword = wrap(async (req, res) => {
  res.json(await staffService.resetStaffLoginPassword(req.schoolId, req.params.staffId));
});

const linkExistingUser = wrap(async (req, res) => {
  res.json(await staffService.linkStaffToExistingUser(req.schoolId, req.params.staffId, req.body.userId));
});

module.exports = {
  listStaff,
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
  listUnlinkedUsers,
  createLogin,
  resetLoginPassword,
  linkExistingUser,
};
