const financialsService = require('./service');
const { buildReceiptPdf } = require('../../utils/receiptPdf');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const generateBills = wrap(async (req, res) => {
  res.status(201).json(await financialsService.generateBills(req.schoolId, req.auth.userId, req.body));
});

const previewBillGeneration = wrap(async (req, res) => {
  const {
    billingCycle, academicYearId, termId, month, year, targetType, targetIds, feeTypeIds,
  } = req.body;
  res.json(await financialsService.previewBillGeneration(req.schoolId, {
    billingCycle, academicYearId, termId, month, year, targetType, targetIds, feeTypeIds,
  }));
});

const listBills = wrap(async (req, res) => {
  const {
    academicYearId, termId, billingCycle, periodMonth, periodYear, status, levelId, classId, studentId,
  } = req.query;
  res.json(await financialsService.listBills(req.schoolId, {
    academicYearId, termId, billingCycle, periodMonth, periodYear, status, levelId, classId, studentId,
  }));
});

const confirmBill = wrap(async (req, res) => {
  const result = await financialsService.confirmBill(req.schoolId, req.params.id, req.auth.userId);
  res.json(result.bill);
});

const confirmBills = wrap(async (req, res) => {
  res.json(await financialsService.confirmBills(req.schoolId, req.body.billIds, req.auth.userId));
});

const emailBills = wrap(async (req, res) => {
  res.json(await financialsService.emailBills(req.schoolId, req.body.billIds));
});

const addSpecialItem = wrap(async (req, res) => {
  res.status(201).json(await financialsService.addSpecialItem(req.schoolId, req.params.id, req.body));
});

const removeBillItem = wrap(async (req, res) => {
  await financialsService.removeBillItem(req.schoolId, req.params.id);
  res.status(204).send();
});

const getStudentLedger = wrap(async (req, res) => {
  res.json(await financialsService.getStudentLedger(req.schoolId, req.params.studentId));
});

const getStudentFinancialStatement = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await financialsService.getStudentFinancialStatement(req.schoolId, req.params.studentId, { from, to }));
});

const recordPayment = wrap(async (req, res) => {
  res.status(201).json(
    await financialsService.recordPayment(req.schoolId, req.params.studentId, req.auth.userId, req.body),
  );
});

const deletePayment = wrap(async (req, res) => {
  await financialsService.deletePayment(req.schoolId, req.params.id, req.auth.userId);
  res.status(204).send();
});

const listPayments = wrap(async (req, res) => {
  const {
    from, to, levelId, classId,
  } = req.query;
  res.json(await financialsService.listPayments(req.schoolId, {
    from, to, levelId, classId,
  }));
});

const updatePayment = wrap(async (req, res) => {
  res.json(await financialsService.updateBillPayment(req.schoolId, req.params.id, req.auth.userId, req.body));
});

const getPaymentRevisions = wrap(async (req, res) => {
  res.json(await financialsService.getPaymentRevisions(req.schoolId, req.params.id));
});

const getReceipt = wrap(async (req, res) => {
  const data = await financialsService.getReceiptData(req.schoolId, req.params.id);
  const pdfBuffer = await buildReceiptPdf(data);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="receipt-${data.payment.receiptNumber}.pdf"`,
  });
  res.send(pdfBuffer);
});

const getBillAnalytics = wrap(async (req, res) => {
  const { academicYearId, termId } = req.query;
  res.json(await financialsService.getBillAnalytics(req.schoolId, { academicYearId, termId }));
});

const getPaymentAnalytics = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await financialsService.getPaymentAnalytics(req.schoolId, { from, to }));
});

const getDebtors = wrap(async (req, res) => {
  const { levelId, classId } = req.query;
  res.json(await financialsService.getDebtors(req.schoolId, { levelId, classId }));
});

const sendDebtReminders = wrap(async (req, res) => {
  res.json(await financialsService.sendDebtReminders(req.schoolId, req.auth.userId, req.body));
});

module.exports = {
  generateBills,
  previewBillGeneration,
  listBills,
  confirmBill,
  confirmBills,
  emailBills,
  addSpecialItem,
  removeBillItem,
  getStudentLedger,
  getStudentFinancialStatement,
  recordPayment,
  deletePayment,
  getReceipt,
  listPayments,
  updatePayment,
  getPaymentRevisions,
  getBillAnalytics,
  getPaymentAnalytics,
  getDebtors,
  sendDebtReminders,
};
