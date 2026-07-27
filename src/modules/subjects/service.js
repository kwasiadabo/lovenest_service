const { Subject } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

async function listSubjects(schoolId) {
  return tenantScoped(Subject, schoolId).findAll({ order: [['name', 'ASC']] });
}

async function createSubject(schoolId, { name, code }) {
  return tenantScoped(Subject, schoolId).create({ name, code });
}

async function updateSubject(schoolId, subjectId, data) {
  const subject = await tenantScoped(Subject, schoolId).findByPk(subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');
  await subject.update(data);
  return subject;
}

async function deleteSubject(schoolId, subjectId) {
  const deleted = await tenantScoped(Subject, schoolId).destroy({ where: { id: subjectId } });
  if (!deleted) throw new ApiError(404, 'Subject not found');
}

module.exports = { listSubjects, createSubject, updateSubject, deleteSubject };
