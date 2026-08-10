const service = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// --- Grading schemes ---

const listGradingSchemes = wrap(async (req, res) => {
  const { academicLevelId } = req.query;
  res.json(await service.listGradingSchemes(req.schoolId, { academicLevelId: academicLevelId || undefined }));
});

const createGradingScheme = wrap(async (req, res) => {
  res.status(201).json(await service.createGradingScheme(req.schoolId, req.body, req.auth.userId));
});

const getGradingScheme = wrap(async (req, res) => {
  res.json(await service.getSchemeOrThrow(req.schoolId, req.params.id));
});

const updateGradingScheme = wrap(async (req, res) => {
  res.json(await service.updateGradingScheme(req.schoolId, req.params.id, req.body));
});

const activateGradingScheme = wrap(async (req, res) => {
  res.json(await service.activateGradingScheme(req.schoolId, req.params.id));
});

const updatePerformanceLevels = wrap(async (req, res) => {
  res.json(await service.updatePerformanceLevels(req.schoolId, req.params.id, req.body.levels));
});

// --- Calculation ---

const triggerCalculation = wrap(async (req, res) => {
  const { termId, scopeType, scopeRefId } = req.body;
  res.status(202).json(await service.runResultCalculation(
    req.schoolId,
    { termId, scopeType, scopeRefId },
    { userId: req.auth.userId, triggerType: 'MANUAL' },
  ));
});

// --- Reads ---

const getStudentRanking = wrap(async (req, res) => {
  const { termId, subjectId, scope } = req.query;
  res.json(await service.getStudentRanking(req.schoolId, req.params.studentId, {
    termId, subjectId: subjectId || undefined, scope: scope || undefined,
  }));
});

const getStudentPercentile = wrap(async (req, res) => {
  const { termId, subjectId } = req.query;
  res.json(await service.getStudentPercentile(req.schoolId, req.params.studentId, {
    termId, subjectId: subjectId || undefined,
  }));
});

const getStudentStanine = wrap(async (req, res) => {
  const { termId, subjectId } = req.query;
  res.json(await service.getStudentStanine(req.schoolId, req.params.studentId, {
    termId, subjectId: subjectId || undefined,
  }));
});

const getClassStanineDistribution = wrap(async (req, res) => {
  const { termId, subjectId } = req.query;
  res.json(await service.getClassStanineDistribution(req.schoolId, req.params.classId, {
    termId, subjectId: subjectId || undefined,
  }));
});

module.exports = {
  listGradingSchemes,
  createGradingScheme,
  getGradingScheme,
  updateGradingScheme,
  activateGradingScheme,
  updatePerformanceLevels,
  triggerCalculation,
  getStudentRanking,
  getStudentPercentile,
  getStudentStanine,
  getClassStanineDistribution,
};
