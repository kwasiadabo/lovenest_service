const { SubjectTeacher, ClassTeacher, Class, Subject, Staff, Level } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

const subjectTeacherInclude = [
  { model: Class, include: [Level] },
  Subject,
  Staff,
];

const classTeacherInclude = [
  { model: Class, include: [Level] },
  Staff,
];

async function listSubjectTeachers(schoolId, classId) {
  return tenantScoped(SubjectTeacher, schoolId).findAll({
    where: classId ? { classId } : undefined,
    include: subjectTeacherInclude,
    order: [['createdAt', 'ASC']],
  });
}

async function assignSubjectTeacher(schoolId, { classId, subjectId, staffId }) {
  const klass = await tenantScoped(Class, schoolId).findByPk(classId);
  if (!klass) throw new ApiError(404, 'Class not found');

  const subject = await tenantScoped(Subject, schoolId).findByPk(subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');

  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  if (staff.staffType !== 'TEACHING') {
    throw new ApiError(400, 'Only teaching staff can be assigned as a subject teacher');
  }

  const existing = await tenantScoped(SubjectTeacher, schoolId).findOne({ where: { classId, subjectId } });
  if (existing) {
    existing.staffId = staffId;
    await existing.save();
  }

  const assignment = existing || await tenantScoped(SubjectTeacher, schoolId).create({ classId, subjectId, staffId });
  return tenantScoped(SubjectTeacher, schoolId).findByPk(assignment.id, { include: subjectTeacherInclude });
}

async function removeSubjectTeacher(schoolId, id) {
  const deleted = await tenantScoped(SubjectTeacher, schoolId).destroy({ where: { id } });
  if (!deleted) throw new ApiError(404, 'Assignment not found');
}

// ---- Class teachers ----
// A class can have more than one class teacher, so this is a plain
// many-to-many list, not an upsert like subject teachers.

async function listClassTeachers(schoolId, classId) {
  return tenantScoped(ClassTeacher, schoolId).findAll({
    where: classId ? { classId } : undefined,
    include: classTeacherInclude,
    order: [['createdAt', 'ASC']],
  });
}

async function addClassTeacher(schoolId, { classId, staffId }) {
  const klass = await tenantScoped(Class, schoolId).findByPk(classId);
  if (!klass) throw new ApiError(404, 'Class not found');

  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  if (staff.staffType !== 'TEACHING') {
    throw new ApiError(400, 'Only teaching staff can be assigned as a class teacher');
  }

  const existing = await tenantScoped(ClassTeacher, schoolId).findOne({ where: { classId, staffId } });
  if (existing) {
    throw new ApiError(409, 'This teacher is already assigned to this class');
  }

  const created = await tenantScoped(ClassTeacher, schoolId).create({ classId, staffId });
  return tenantScoped(ClassTeacher, schoolId).findByPk(created.id, { include: classTeacherInclude });
}

async function removeClassTeacher(schoolId, id) {
  const deleted = await tenantScoped(ClassTeacher, schoolId).destroy({ where: { id } });
  if (!deleted) throw new ApiError(404, 'Assignment not found');
}

module.exports = {
  listSubjectTeachers,
  assignSubjectTeacher,
  removeSubjectTeacher,
  listClassTeachers,
  addClassTeacher,
  removeClassTeacher,
};
