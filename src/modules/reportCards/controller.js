const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const generate = wrap(async (req, res) => {
  const { studentId, termId } = req.query;
  res.json(await service.generateReportCard(req.schoolId, req.auth.userId, req.auth.roles, studentId, termId));
});

const classSummary = wrap(async (req, res) => {
  const { classId, termId } = req.query;
  res.json(await service.getClassSummary(req.schoolId, req.auth.userId, req.auth.roles, classId, termId));
});

const getRemarks = wrap(async (req, res) => {
  const { studentId, termId } = req.params;
  res.json(await service.getRemarks(req.schoolId, req.auth.userId, req.auth.roles, studentId, termId));
});

const updateRemarks = wrap(async (req, res) => {
  const { studentId, termId } = req.params;
  res.json(await service.updateRemarks(req.schoolId, req.auth.userId, req.auth.roles, studentId, termId, req.body));
});

const updateHeadteacherRemark = wrap(async (req, res) => {
  const { studentId, termId } = req.params;
  res.json(await service.updateHeadteacherRemark(
    req.schoolId, req.auth.userId, req.auth.roles, studentId, termId, req.body.headteacherRemark,
  ));
});

const publish = wrap(async (req, res) => {
  const { studentId, termId } = req.params;
  res.json(await service.publishReportCard(req.schoolId, req.auth.userId, req.auth.roles, studentId, termId));
});

const publishAll = wrap(async (req, res) => {
  const { classId, termId } = req.params;
  res.json(await service.publishClassReportCards(req.schoolId, req.auth.userId, req.auth.roles, classId, termId));
});

const setClassNextTermStartDate = wrap(async (req, res) => {
  const { classId, termId } = req.params;
  res.json(await service.setClassNextTermStartDate(
    req.schoolId, req.auth.userId, req.auth.roles, classId, termId, req.body.nextTermStartDate,
  ));
});

const history = wrap(async (req, res) => {
  const { studentId, academicYearId } = req.params;
  res.json(await service.getReportCardHistory(req.schoolId, req.auth.userId, req.auth.roles, studentId, academicYearId));
});

module.exports = {
  generate,
  classSummary,
  getRemarks,
  updateRemarks,
  updateHeadteacherRemark,
  publish,
  publishAll,
  setClassNextTermStartDate,
  history,
};
