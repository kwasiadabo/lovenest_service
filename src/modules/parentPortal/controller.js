const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getChildren = wrap(async (req, res) => {
  res.json(await service.getChildren(req.schoolId, req.auth.userId));
});

const getReportCard = wrap(async (req, res) => {
  res.json(await service.getReportCard(req.schoolId, req.auth.userId, req.params.studentId, req.query.termId));
});

const getStudentBills = wrap(async (req, res) => {
  res.json(await service.getStudentBills(req.schoolId, req.auth.userId, req.params.studentId));
});

const getStudentLevies = wrap(async (req, res) => {
  res.json(await service.getStudentLevies(req.schoolId, req.auth.userId, req.params.studentId));
});

const getFinancialStatement = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await service.getFinancialStatement(req.schoolId, req.auth.userId, req.params.studentId, { from, to }));
});

const getAttendance = wrap(async (req, res) => {
  res.json(await service.getAttendance(req.schoolId, req.auth.userId, req.params.studentId, req.query.termId));
});

const getDailyActivities = wrap(async (req, res) => {
  res.json(await service.getDailyActivities(req.schoolId, req.auth.userId, req.params.studentId, req.query.termId));
});

const getAnnouncements = wrap(async (req, res) => {
  res.json(await service.getAnnouncements(req.schoolId));
});

const getNewsletters = wrap(async (req, res) => {
  res.json(await service.getNewsletters(req.schoolId));
});

const createIssue = wrap(async (req, res) => {
  const { studentId, subject, body } = req.body;
  res.status(201).json(await service.createIssue(req.schoolId, req.auth.userId, { studentId, subject, body }));
});

const listIssues = wrap(async (req, res) => {
  res.json(await service.listIssues(req.schoolId, req.auth.userId));
});

const getIssue = wrap(async (req, res) => {
  res.json(await service.getIssue(req.schoolId, req.auth.userId, req.params.id));
});

const addIssueMessage = wrap(async (req, res) => {
  res.status(201).json(await service.addIssueMessage(req.schoolId, req.auth.userId, req.params.id, req.body.body));
});

const getIncidents = wrap(async (req, res) => {
  res.json(await service.getIncidents(req.schoolId, req.auth.userId, req.params.studentId));
});

const getSickBayVisits = wrap(async (req, res) => {
  res.json(await service.getSickBayVisits(req.schoolId, req.auth.userId, req.params.studentId));
});

const getMedicationLogs = wrap(async (req, res) => {
  res.json(await service.getMedicationLogs(req.schoolId, req.auth.userId, req.params.studentId));
});

const getTransport = wrap(async (req, res) => {
  res.json(await service.getTransport(req.schoolId, req.auth.userId, req.params.studentId));
});

const getTransportHistory = wrap(async (req, res) => {
  const { from, to } = req.query;
  res.json(await service.getTransportHistory(req.schoolId, req.auth.userId, req.params.studentId, { from, to }));
});

const getLiveTransport = wrap(async (req, res) => {
  res.json(await service.getLiveTransport(req.schoolId, req.auth.userId, req.params.studentId));
});

const initializeFeePayment = wrap(async (req, res) => {
  res.json(await service.initializeFeePayment(req.schoolId, req.auth.userId, req.params.studentId));
});

const verifyFeePayment = wrap(async (req, res) => {
  res.json(await service.verifyFeePayment(req.schoolId, req.auth.userId, req.params.reference));
});

module.exports = {
  getChildren,
  getReportCard,
  getStudentBills,
  getStudentLevies,
  getFinancialStatement,
  getAttendance,
  getDailyActivities,
  getAnnouncements,
  getNewsletters,
  createIssue,
  listIssues,
  getIssue,
  addIssueMessage,
  getIncidents,
  getSickBayVisits,
  getMedicationLogs,
  getTransport,
  getTransportHistory,
  getLiveTransport,
  initializeFeePayment,
  verifyFeePayment,
};
