const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getFund = wrap(async (req, res) => {
  res.json(await service.getFund(req.schoolId));
});

const setUpFund = wrap(async (req, res) => {
  res.status(201).json(await service.setUpFund(req.schoolId, req.auth.userId, req.body));
});

const updateFund = wrap(async (req, res) => {
  const { id } = req.params;
  res.json(await service.updateFund(req.schoolId, id, req.body));
});

const topUpFund = wrap(async (req, res) => {
  res.status(201).json(await service.topUpFund(req.schoolId, req.auth.userId, req.body));
});

const listVouchers = wrap(async (req, res) => {
  const { status, from, to } = req.query;
  res.json(await service.listVouchers(req.schoolId, { status, from, to }));
});

const recordDisbursement = wrap(async (req, res) => {
  res.status(201).json(await service.recordDisbursement(req.schoolId, req.auth.userId, req.body));
});

const voidVoucher = wrap(async (req, res) => {
  const { id } = req.params;
  res.json(await service.voidVoucher(req.schoolId, id, req.auth.userId, req.body));
});

const listReplenishments = wrap(async (req, res) => {
  res.json(await service.listReplenishments(req.schoolId));
});

const recordReplenishment = wrap(async (req, res) => {
  res.status(201).json(await service.recordReplenishment(req.schoolId, req.auth.userId, req.body));
});

module.exports = {
  getFund,
  setUpFund,
  updateFund,
  topUpFund,
  listVouchers,
  recordDisbursement,
  voidVoucher,
  listReplenishments,
  recordReplenishment,
};
