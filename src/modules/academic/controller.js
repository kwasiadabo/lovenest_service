const academicService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listAcademicYears = wrap(async (req, res) => {
  res.json(await academicService.listAcademicYears(req.schoolId));
});

const createAcademicYear = wrap(async (req, res) => {
  res.status(201).json(await academicService.createAcademicYear(req.schoolId, req.body));
});

const updateAcademicYear = wrap(async (req, res) => {
  res.json(await academicService.updateAcademicYear(req.schoolId, req.params.academicYearId, req.body));
});

const setCurrentAcademicYear = wrap(async (req, res) => {
  res.json(await academicService.setCurrentAcademicYear(req.schoolId, req.params.academicYearId));
});

const listTerms = wrap(async (req, res) => {
  res.json(await academicService.listTerms(req.schoolId, req.query.academicYearId));
});

const createTerm = wrap(async (req, res) => {
  res.status(201).json(
    await academicService.createTerm(req.schoolId, req.params.academicYearId, req.body),
  );
});

const updateTerm = wrap(async (req, res) => {
  res.json(await academicService.updateTerm(req.schoolId, req.params.termId, req.body));
});

const setCurrentTerm = wrap(async (req, res) => {
  res.json(await academicService.setCurrentTerm(req.schoolId, req.params.termId));
});

const listLevels = wrap(async (req, res) => {
  res.json(await academicService.listLevels(req.schoolId));
});

const listClasses = wrap(async (req, res) => {
  res.json(await academicService.listClasses(req.schoolId, req.query.levelId));
});

const createClass = wrap(async (req, res) => {
  res.status(201).json(await academicService.createClass(req.schoolId, req.body));
});

const updateClass = wrap(async (req, res) => {
  res.json(await academicService.updateClass(req.schoolId, req.params.classId, req.body));
});

const deleteClass = wrap(async (req, res) => {
  await academicService.deleteClass(req.schoolId, req.params.classId);
  res.status(204).send();
});

module.exports = {
  listAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
  listTerms,
  createTerm,
  updateTerm,
  setCurrentTerm,
  listLevels,
  listClasses,
  createClass,
  updateClass,
  deleteClass,
};
