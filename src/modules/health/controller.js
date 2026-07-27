const healthService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listSickBayVisits = wrap(async (req, res) => {
  res.json(await healthService.listSickBayVisits(req.schoolId, req.query));
});
const createSickBayVisit = wrap(async (req, res) => {
  res.status(201).json(await healthService.createSickBayVisit(req.schoolId, req.auth.userId, req.body));
});
const updateSickBayVisit = wrap(async (req, res) => {
  res.json(await healthService.updateSickBayVisit(req.schoolId, req.params.id, req.body));
});
const deleteSickBayVisit = wrap(async (req, res) => {
  await healthService.deleteSickBayVisit(req.schoolId, req.params.id);
  res.status(204).send();
});

const listMedicationLogs = wrap(async (req, res) => {
  res.json(await healthService.listMedicationLogs(req.schoolId, req.query));
});
const createMedicationLog = wrap(async (req, res) => {
  res.status(201).json(await healthService.createMedicationLog(req.schoolId, req.auth.userId, req.body));
});
const updateMedicationLog = wrap(async (req, res) => {
  res.json(await healthService.updateMedicationLog(req.schoolId, req.params.id, req.body));
});
const deleteMedicationLog = wrap(async (req, res) => {
  await healthService.deleteMedicationLog(req.schoolId, req.params.id);
  res.status(204).send();
});

const listImmunizations = wrap(async (req, res) => {
  res.json(await healthService.listImmunizations(req.schoolId, req.query));
});
const createImmunization = wrap(async (req, res) => {
  res.status(201).json(await healthService.createImmunization(req.schoolId, req.auth.userId, req.body));
});
const updateImmunization = wrap(async (req, res) => {
  res.json(await healthService.updateImmunization(req.schoolId, req.params.id, req.body));
});
const deleteImmunization = wrap(async (req, res) => {
  await healthService.deleteImmunization(req.schoolId, req.params.id);
  res.status(204).send();
});

const getHealthAnalytics = wrap(async (req, res) => {
  res.json(await healthService.getHealthAnalytics(req.schoolId, req.query));
});

module.exports = {
  listSickBayVisits,
  createSickBayVisit,
  updateSickBayVisit,
  deleteSickBayVisit,
  listMedicationLogs,
  createMedicationLog,
  updateMedicationLog,
  deleteMedicationLog,
  listImmunizations,
  createImmunization,
  updateImmunization,
  deleteImmunization,
  getHealthAnalytics,
};
