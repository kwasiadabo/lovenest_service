const messagingService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const previewParentRecipients = wrap(async (req, res) => {
  const { levelId, classId } = req.query;
  res.json(await messagingService.previewRecipients(req.schoolId, 'PARENTS', { levelId, classId }));
});

const previewTeacherRecipients = wrap(async (req, res) => {
  const { staffType } = req.query;
  res.json(await messagingService.previewRecipients(req.schoolId, 'TEACHERS', { staffType }));
});

const composeSend = wrap(async (req, res) => {
  res.status(201).json(await messagingService.composeSend(req.schoolId, req.auth.userId, req.body));
});

const listBatches = wrap(async (req, res) => {
  const { audience, source } = req.query;
  res.json(await messagingService.listMessageBatches(req.schoolId, { audience, source }));
});

const getBatch = wrap(async (req, res) => {
  res.json(await messagingService.getMessageBatch(req.schoolId, req.params.id));
});

module.exports = {
  previewParentRecipients, previewTeacherRecipients, composeSend, listBatches, getBatch,
};
