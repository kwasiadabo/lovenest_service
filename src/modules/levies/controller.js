const leviesService = require('./service');
const { buildReceiptPdf } = require('../../utils/receiptPdf');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const createLevy = wrap(async (req, res) => {
  res.status(201).json(await leviesService.createLevy(req.schoolId, req.auth.userId, req.body));
});

const listLevies = wrap(async (req, res) => {
  const { academicYearId, status } = req.query;
  res.json(await leviesService.listLevies(req.schoolId, { academicYearId, status }));
});

const getLevy = wrap(async (req, res) => {
  res.json(await leviesService.getLevyDetail(req.schoolId, req.params.id));
});

const updateLevy = wrap(async (req, res) => {
  res.json(await leviesService.updateLevy(req.schoolId, req.params.id, req.body));
});

const closeLevy = wrap(async (req, res) => {
  res.json(await leviesService.closeLevy(req.schoolId, req.params.id));
});

const reopenLevy = wrap(async (req, res) => {
  res.json(await leviesService.reopenLevy(req.schoolId, req.params.id));
});

const deleteLevy = wrap(async (req, res) => {
  await leviesService.deleteLevy(req.schoolId, req.params.id);
  res.status(204).send();
});

const getLevyCollection = wrap(async (req, res) => {
  res.json(await leviesService.getLevyCollection(req.schoolId, req.params.id));
});

const getLevyPeriodReport = wrap(async (req, res) => {
  const { asOfDate, termId } = req.query;
  res.json(await leviesService.getLevyPeriodReport(req.schoolId, req.params.id, { asOfDate, termId }));
});

const recordLevyPayment = wrap(async (req, res) => {
  res.status(201).json(
    await leviesService.recordLevyPayment(req.schoolId, req.params.id, req.params.studentId, req.auth.userId, req.body),
  );
});

const bulkRecordLevyPayments = wrap(async (req, res) => {
  res.status(201).json(
    await leviesService.bulkRecordLevyPayments(req.schoolId, req.params.id, req.auth.userId, req.body),
  );
});

const listLevyPayments = wrap(async (req, res) => {
  const {
    levyId, from, to, classId,
  } = req.query;
  res.json(await leviesService.listLevyPayments(req.schoolId, {
    levyId, from, to, classId,
  }));
});

const updateLevyPayment = wrap(async (req, res) => {
  res.json(await leviesService.updateLevyPayment(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const deleteLevyPayment = wrap(async (req, res) => {
  await leviesService.deleteLevyPayment(req.schoolId, req.params.id, req.auth.userId);
  res.status(204).send();
});

const getLevyPaymentReceipt = wrap(async (req, res) => {
  const data = await leviesService.getLevyPaymentReceiptData(req.schoolId, req.params.id);
  const pdfBuffer = await buildReceiptPdf(data);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="receipt-${data.payment.receiptNumber}.pdf"`,
  });
  res.send(pdfBuffer);
});

const getLevyPaymentRevisions = wrap(async (req, res) => {
  res.json(await leviesService.getLevyPaymentRevisions(req.schoolId, req.params.id));
});

module.exports = {
  createLevy,
  listLevies,
  getLevy,
  updateLevy,
  closeLevy,
  reopenLevy,
  deleteLevy,
  getLevyCollection,
  getLevyPeriodReport,
  recordLevyPayment,
  bulkRecordLevyPayments,
  listLevyPayments,
  updateLevyPayment,
  deleteLevyPayment,
  getLevyPaymentReceipt,
  getLevyPaymentRevisions,
};
