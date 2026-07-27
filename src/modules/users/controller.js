const usersService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listUsers = wrap(async (req, res) => {
  res.json(await usersService.listUsers(req.schoolId));
});

const setUserStatus = wrap(async (req, res) => {
  res.json(
    await usersService.setUserStatus(req.schoolId, req.params.userId, req.auth.userId, req.body.status),
  );
});

const resetUserPassword = wrap(async (req, res) => {
  res.json(await usersService.resetUserPassword(req.schoolId, req.params.userId));
});

const updateUserRoles = wrap(async (req, res) => {
  res.json(await usersService.updateUserRoles(req.schoolId, req.params.userId, req.body.roles));
});

module.exports = { listUsers, setUserStatus, resetUserPassword, updateUserRoles };
