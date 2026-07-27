const dutiesService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listStaffDuties = wrap(async (req, res) => {
  res.json(await dutiesService.listStaffDuties(req.schoolId));
});

const createStaffDuty = wrap(async (req, res) => {
  res.status(201).json(await dutiesService.createStaffDuty(req.schoolId, req.body));
});

const updateStaffDuty = wrap(async (req, res) => {
  res.json(await dutiesService.updateStaffDuty(req.schoolId, req.params.dutyId, req.body));
});

const deleteStaffDuty = wrap(async (req, res) => {
  await dutiesService.deleteStaffDuty(req.schoolId, req.params.dutyId);
  res.status(204).send();
});

const listDutyRoster = wrap(async (req, res) => {
  res.json(await dutiesService.listDutyRoster(req.schoolId, req.query));
});

const createDutyRosterEntry = wrap(async (req, res) => {
  res.status(201).json(await dutiesService.createDutyRosterEntry(req.schoolId, req.body));
});

const deleteDutyRosterEntry = wrap(async (req, res) => {
  await dutiesService.deleteDutyRosterEntry(req.schoolId, req.params.id);
  res.status(204).send();
});

module.exports = {
  listStaffDuties,
  createStaffDuty,
  updateStaffDuty,
  deleteStaffDuty,
  listDutyRoster,
  createDutyRosterEntry,
  deleteDutyRosterEntry,
};
