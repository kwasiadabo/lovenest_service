const assignmentsService = require('./service');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listSubjectTeachers = wrap(async (req, res) => {
  res.json(await assignmentsService.listSubjectTeachers(req.schoolId, req.query.classId));
});

const assignSubjectTeacher = wrap(async (req, res) => {
  res.status(201).json(await assignmentsService.assignSubjectTeacher(req.schoolId, req.body));
});

const removeSubjectTeacher = wrap(async (req, res) => {
  await assignmentsService.removeSubjectTeacher(req.schoolId, req.params.id);
  res.status(204).send();
});

const listClassTeachers = wrap(async (req, res) => {
  res.json(await assignmentsService.listClassTeachers(req.schoolId, req.query.classId));
});

const addClassTeacher = wrap(async (req, res) => {
  res.status(201).json(await assignmentsService.addClassTeacher(req.schoolId, req.body));
});

const removeClassTeacher = wrap(async (req, res) => {
  await assignmentsService.removeClassTeacher(req.schoolId, req.params.id);
  res.status(204).send();
});

module.exports = {
  listSubjectTeachers,
  assignSubjectTeacher,
  removeSubjectTeacher,
  listClassTeachers,
  addClassTeacher,
  removeClassTeacher,
};
