const fixedAssetsService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listFixedAssets = wrap(async (req, res) => {
  const { status } = req.query;
  res.json(await fixedAssetsService.listFixedAssets(req.schoolId, { status }));
});

const getFixedAsset = wrap(async (req, res) => {
  res.json(await fixedAssetsService.getFixedAsset(req.schoolId, req.params.id));
});

const createFixedAsset = wrap(async (req, res) => {
  res.status(201).json(await fixedAssetsService.createFixedAsset(req.schoolId, req.auth.userId, req.body));
});

const runDepreciation = wrap(async (req, res) => {
  res.status(201).json(await fixedAssetsService.runDepreciation(req.schoolId, req.auth.userId, req.body));
});

const disposeFixedAsset = wrap(async (req, res) => {
  res.json(await fixedAssetsService.disposeFixedAsset(req.schoolId, req.params.id, req.auth.userId, req.body));
});

module.exports = {
  listFixedAssets, getFixedAsset, createFixedAsset, runDepreciation, disposeFixedAsset,
};
