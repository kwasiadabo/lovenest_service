const staffAppraisalsService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listStaffAppraisals = wrap(async (req, res) => {
  res.json(await staffAppraisalsService.listStaffAppraisals(req.schoolId, req.params.staffId));
});

const createStaffAppraisal = wrap(async (req, res) => {
  res.status(201).json(await staffAppraisalsService.createStaffAppraisal(req.schoolId, req.params.staffId, req.body));
});

const deleteStaffAppraisal = wrap(async (req, res) => {
  await staffAppraisalsService.deleteStaffAppraisal(req.schoolId, req.params.staffId, req.params.appraisalId);
  res.status(204).send();
});

module.exports = {
  listStaffAppraisals,
  createStaffAppraisal,
  deleteStaffAppraisal,
};
