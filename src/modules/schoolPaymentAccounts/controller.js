const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listPaymentAccounts = wrap(async (req, res) => {
  const { isActive } = req.query;
  res.json(await service.listPaymentAccounts(req.schoolId, {
    isActive: isActive === undefined ? undefined : isActive === 'true',
  }));
});

const createPaymentAccount = wrap(async (req, res) => {
  res.status(201).json(await service.createPaymentAccount(req.schoolId, req.body));
});

const updatePaymentAccount = wrap(async (req, res) => {
  res.json(await service.updatePaymentAccount(req.schoolId, req.params.id, req.body));
});

module.exports = { listPaymentAccounts, createPaymentAccount, updatePaymentAccount };
