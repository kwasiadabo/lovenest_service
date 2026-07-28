const { StaffDocument, Staff } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

async function assertStaffExists(schoolId, staffId) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  return staff;
}

async function listStaffDocuments(schoolId, staffId) {
  await assertStaffExists(schoolId, staffId);
  return tenantScoped(StaffDocument, schoolId).findAll({
    where: { staffId },
    order: [['createdAt', 'DESC']],
  });
}

async function createStaffDocument(schoolId, staffId, data) {
  await assertStaffExists(schoolId, staffId);
  if (!StaffDocument.DOCUMENT_TYPES.includes(data.documentType)) {
    throw new ApiError(400, `documentType must be one of: ${StaffDocument.DOCUMENT_TYPES.join(', ')}`);
  }
  if (!data.title) throw new ApiError(400, 'title is required');
  if (!data.fileUrl) throw new ApiError(400, 'fileUrl is required');

  return tenantScoped(StaffDocument, schoolId).create({
    staffId,
    documentType: data.documentType,
    title: data.title,
    fileUrl: data.fileUrl,
    issueDate: data.issueDate || null,
    expiryDate: data.expiryDate || null,
    notes: data.notes || null,
  });
}

async function deleteStaffDocument(schoolId, staffId, documentId) {
  const deleted = await tenantScoped(StaffDocument, schoolId).destroy({ where: { id: documentId, staffId } });
  if (!deleted) throw new ApiError(404, 'Staff document not found');
}

module.exports = {
  listStaffDocuments,
  createStaffDocument,
  deleteStaffDocument,
};
