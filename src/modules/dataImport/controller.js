const dataImportService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getTemplate = wrap(async (req, res) => {
  const { type } = req.params;
  const buffer = await dataImportService.generateTemplate(type);
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${type.toLowerCase()}-import-template.xlsx"`,
  });
  res.send(buffer);
});

const preview = wrap(async (req, res) => {
  const { type } = req.params;
  const result = await dataImportService.previewImport(
    req.schoolId, req.auth.userId, type, req.file.buffer, req.file.originalname, req.file.mimetype,
  );
  res.status(201).json(result);
});

const confirm = wrap(async (req, res) => {
  res.json(await dataImportService.confirmImport(req.schoolId, req.auth.userId, req.params.id));
});

const cancel = wrap(async (req, res) => {
  await dataImportService.cancelImport(req.schoolId, req.params.id);
  res.status(204).send();
});

const list = wrap(async (req, res) => {
  res.json(await dataImportService.listImportBatches(req.schoolId));
});

const getDetail = wrap(async (req, res) => {
  res.json(await dataImportService.getImportBatch(req.schoolId, req.params.id));
});

module.exports = {
  getTemplate, preview, confirm, cancel, list, getDetail,
};
