const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listActivities = wrap(async (req, res) => {
  res.json(await service.listActivities(req.schoolId, req.query.levelId));
});

const createActivity = wrap(async (req, res) => {
  res.status(201).json(await service.createActivity(req.schoolId, req.auth.userId, req.body));
});

const updateActivity = wrap(async (req, res) => {
  res.json(await service.updateActivity(req.schoolId, req.params.activityId, req.body));
});

const deleteActivity = wrap(async (req, res) => {
  await service.deleteActivity(req.schoolId, req.params.activityId);
  res.status(204).send();
});

const getRatingGrid = wrap(async (req, res) => {
  const { classId, termId } = req.query;
  res.json(await service.getRatingGrid(req.schoolId, req.auth.userId, req.auth.roles, { classId, termId }));
});

const saveRating = wrap(async (req, res) => {
  res.json(await service.saveRating(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

const confirmRatings = wrap(async (req, res) => {
  res.json(await service.confirmRatings(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

const reopenRatings = wrap(async (req, res) => {
  res.json(await service.reopenRatings(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

const getDailyLogGrid = wrap(async (req, res) => {
  const { classId, termId, date } = req.query;
  res.json(await service.getDailyLogGrid(req.schoolId, req.auth.userId, req.auth.roles, { classId, termId, date }));
});

const saveDailyLogEntry = wrap(async (req, res) => {
  res.json(await service.saveDailyLogEntry(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

module.exports = {
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  getRatingGrid,
  saveRating,
  confirmRatings,
  reopenRatings,
  getDailyLogGrid,
  saveDailyLogEntry,
};
