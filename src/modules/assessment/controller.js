const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getMyAssignments = wrap(async (req, res) => {
  res.json(await service.getMyAssignments(req.schoolId, req.auth.userId, req.auth.roles));
});

const getAssessmentGrid = wrap(async (req, res) => {
  const {
    classId, subjectId, termId, type,
  } = req.query;
  res.json(await service.getAssessmentGrid(req.schoolId, req.auth.userId, req.auth.roles, {
    classId, subjectId, termId, type,
  }));
});

const createItem = wrap(async (req, res) => {
  res.status(201).json(await service.createAssessmentItem(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

const updateItem = wrap(async (req, res) => {
  res.json(await service.updateAssessmentItem(
    req.schoolId, req.auth.userId, req.auth.roles, req.params.itemId, req.body,
  ));
});

const deleteItem = wrap(async (req, res) => {
  await service.deleteAssessmentItem(req.schoolId, req.auth.userId, req.auth.roles, req.params.itemId);
  res.status(204).send();
});

const upsertScore = wrap(async (req, res) => {
  const { itemId, studentId } = req.params;
  res.json(await service.upsertScore(req.schoolId, req.auth.userId, req.auth.roles, {
    itemId, studentId, rawScore: req.body.rawScore,
  }));
});

const getExamGrid = wrap(async (req, res) => {
  const { classId, subjectId, termId } = req.query;
  res.json(await service.getExamGrid(req.schoolId, req.auth.userId, req.auth.roles, { classId, subjectId, termId }));
});

const saveExamScore = wrap(async (req, res) => {
  res.json(await service.saveExamScore(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

const updateExamScoreEffort = wrap(async (req, res) => {
  res.json(await service.updateExamScoreEffort(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

const confirmExamScores = wrap(async (req, res) => {
  res.json(await service.confirmExamScores(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

const reopenExamScores = wrap(async (req, res) => {
  res.json(await service.reopenExamScores(req.schoolId, req.auth.userId, req.auth.roles, req.body));
});

const getExamAnalytics = wrap(async (req, res) => {
  const { academicYearId, termId, classId } = req.query;
  res.json(await service.getExamAnalytics(req.schoolId, { academicYearId, termId, classId }));
});

const getMyExamAnalytics = wrap(async (req, res) => {
  const { academicYearId, termId } = req.query;
  res.json(await service.getMyExamAnalytics(req.schoolId, req.auth.userId, req.auth.roles, { academicYearId, termId }));
});

const getStudentSubjectTrend = wrap(async (req, res) => {
  const { studentId, subjectId, classId } = req.query;
  res.json(await service.getStudentSubjectTrend(req.schoolId, req.auth.userId, req.auth.roles, {
    studentId, subjectId, classId,
  }));
});

module.exports = {
  getMyAssignments,
  getAssessmentGrid,
  createItem,
  updateItem,
  deleteItem,
  upsertScore,
  getExamGrid,
  saveExamScore,
  updateExamScoreEffort,
  confirmExamScores,
  reopenExamScores,
  getExamAnalytics,
  getMyExamAnalytics,
  getStudentSubjectTrend,
};
