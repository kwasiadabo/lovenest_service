const feesService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listFeeTypes = wrap(async (req, res) => {
  res.json(await feesService.listFeeTypes(req.schoolId));
});

const createFeeType = wrap(async (req, res) => {
  res.status(201).json(await feesService.createFeeType(req.schoolId, req.body));
});

const updateFeeType = wrap(async (req, res) => {
  res.json(await feesService.updateFeeType(req.schoolId, req.params.id, req.body));
});

const deleteFeeType = wrap(async (req, res) => {
  await feesService.deleteFeeType(req.schoolId, req.params.id);
  res.status(204).send();
});

const listFeeAmounts = wrap(async (req, res) => {
  const {
    academicYearId, termId, levelId, feeTypeId, classId,
  } = req.query;
  res.json(await feesService.listFeeAmounts(req.schoolId, {
    academicYearId, termId, levelId, feeTypeId, classId,
  }));
});

const setFeeAmount = wrap(async (req, res) => {
  res.status(201).json(await feesService.setFeeAmount(req.schoolId, req.body));
});

const deleteFeeAmount = wrap(async (req, res) => {
  await feesService.deleteFeeAmount(req.schoolId, req.params.id);
  res.status(204).send();
});

module.exports = {
  listFeeTypes,
  createFeeType,
  updateFeeType,
  deleteFeeType,
  listFeeAmounts,
  setFeeAmount,
  deleteFeeAmount,
};
