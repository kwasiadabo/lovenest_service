const staffDocumentsService = require('./service');
const { uploadFileBuffer } = require('../../lib/cloudinary');
const ApiError = require('../../utils/ApiError');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listStaffDocuments = wrap(async (req, res) => {
  res.json(await staffDocumentsService.listStaffDocuments(req.schoolId, req.params.staffId));
});

const createStaffDocument = wrap(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'file is required');
  const result = await uploadFileBuffer(req.file.buffer, { folder: 'staff-documents' });
  const {
    documentType, title, issueDate, expiryDate, notes,
  } = req.body;
  res.status(201).json(await staffDocumentsService.createStaffDocument(req.schoolId, req.params.staffId, {
    documentType,
    title,
    issueDate,
    expiryDate,
    notes,
    fileUrl: result.secure_url,
  }));
});

const deleteStaffDocument = wrap(async (req, res) => {
  await staffDocumentsService.deleteStaffDocument(req.schoolId, req.params.staffId, req.params.documentId);
  res.status(204).send();
});

module.exports = {
  listStaffDocuments,
  createStaffDocument,
  deleteStaffDocument,
};
