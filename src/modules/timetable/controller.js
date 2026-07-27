const timetableService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listPeriods = wrap(async (req, res) => {
  res.json(await timetableService.listPeriods(req.schoolId));
});

const createPeriod = wrap(async (req, res) => {
  res.status(201).json(await timetableService.createPeriod(req.schoolId, req.body));
});

const updatePeriod = wrap(async (req, res) => {
  res.json(await timetableService.updatePeriod(req.schoolId, req.params.id, req.body));
});

const deletePeriod = wrap(async (req, res) => {
  await timetableService.deletePeriod(req.schoolId, req.params.id);
  res.status(204).send();
});

const getClassTimetable = wrap(async (req, res) => {
  res.json(await timetableService.getClassTimetable(req.schoolId, req.query.classId));
});

const saveClassTimetable = wrap(async (req, res) => {
  const { classId, entries } = req.body;
  res.json(await timetableService.saveClassTimetable(req.schoolId, classId, entries));
});

module.exports = {
  listPeriods,
  createPeriod,
  updatePeriod,
  deletePeriod,
  getClassTimetable,
  saveClassTimetable,
};
