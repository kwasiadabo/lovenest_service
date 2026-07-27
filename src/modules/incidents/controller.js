const incidentsService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listIncidents = wrap(async (req, res) => {
  res.json(await incidentsService.listIncidents(req.schoolId, req.query));
});

const getIncident = wrap(async (req, res) => {
  res.json(await incidentsService.getIncident(req.schoolId, req.params.id));
});

const createIncident = wrap(async (req, res) => {
  res.status(201).json(await incidentsService.createIncident(req.schoolId, req.auth.userId, req.body));
});

const updateIncident = wrap(async (req, res) => {
  res.json(await incidentsService.updateIncident(req.schoolId, req.params.id, req.body));
});

const setIncidentStatus = wrap(async (req, res) => {
  res.json(await incidentsService.setIncidentStatus(req.schoolId, req.params.id, req.body.status));
});

const recordAction = wrap(async (req, res) => {
  res.json(await incidentsService.recordAction(req.schoolId, req.params.id, req.body));
});

const deleteIncident = wrap(async (req, res) => {
  await incidentsService.deleteIncident(req.schoolId, req.params.id);
  res.status(204).send();
});

const getIncidentAnalytics = wrap(async (req, res) => {
  res.json(await incidentsService.getIncidentAnalytics(req.schoolId, req.query));
});

module.exports = {
  listIncidents,
  getIncident,
  createIncident,
  updateIncident,
  setIncidentStatus,
  recordAction,
  deleteIncident,
  getIncidentAnalytics,
};
