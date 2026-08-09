const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getToday = wrap(async (req, res) => {
  const { date, search } = req.query;
  res.json(await service.getStudentsWithGateStatus(req.schoolId, { date, search }));
});

const verifyScan = wrap(async (req, res) => {
  res.json(await service.verifyScan(req.schoolId, req.body));
});

const checkIn = wrap(async (req, res) => {
  res.json(await service.recordCheckIn(req.schoolId, req.auth.userId, req.body));
});

const checkOut = wrap(async (req, res) => {
  res.json(await service.recordCheckOut(req.schoolId, req.auth.userId, req.body));
});

const getAuthorizedPickupPersons = wrap(async (req, res) => {
  res.json(await service.getAuthorizedPickupPersons(req.schoolId, req.params.studentId));
});

const addAuthorizedPickupPerson = wrap(async (req, res) => {
  res.status(201).json(
    await service.addAuthorizedPickupPerson(req.schoolId, req.params.studentId, req.auth.userId, req.body),
  );
});

const updateAuthorizedPickupPerson = wrap(async (req, res) => {
  res.json(await service.updateAuthorizedPickupPerson(req.schoolId, req.params.id, req.body));
});

const getDailyReport = wrap(async (req, res) => {
  const {
    date, from, to, search,
  } = req.query;
  res.json(await service.getDailyReport(req.schoolId, {
    date, from, to, search,
  }));
});

const getGateLogSettings = wrap(async (req, res) => {
  res.json(await service.getGateLogSettings(req.schoolId));
});

const updateGateLogSettings = wrap(async (req, res) => {
  res.json(await service.updateGateLogSettings(req.schoolId, req.body));
});

module.exports = {
  getToday,
  verifyScan,
  checkIn,
  checkOut,
  getAuthorizedPickupPersons,
  addAuthorizedPickupPerson,
  updateAuthorizedPickupPerson,
  getDailyReport,
  getGateLogSettings,
  updateGateLogSettings,
};
