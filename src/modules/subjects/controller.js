const subjectsService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listSubjects = wrap(async (req, res) => {
  res.json(await subjectsService.listSubjects(req.schoolId));
});

const createSubject = wrap(async (req, res) => {
  res.status(201).json(await subjectsService.createSubject(req.schoolId, req.body));
});

const updateSubject = wrap(async (req, res) => {
  res.json(await subjectsService.updateSubject(req.schoolId, req.params.subjectId, req.body));
});

const deleteSubject = wrap(async (req, res) => {
  await subjectsService.deleteSubject(req.schoolId, req.params.subjectId);
  res.status(204).send();
});

module.exports = { listSubjects, createSubject, updateSubject, deleteSubject };
