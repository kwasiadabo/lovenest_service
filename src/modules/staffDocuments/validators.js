const ApiError = require('../../utils/ApiError');
const { StaffDocument } = require('../../models');

function validateStaffDocument(req, res, next) {
  const { documentType, title } = req.body || {};
  if (!documentType) return next(new ApiError(400, 'documentType is required'));
  if (!StaffDocument.DOCUMENT_TYPES.includes(documentType)) {
    return next(new ApiError(400, `documentType must be one of: ${StaffDocument.DOCUMENT_TYPES.join(', ')}`));
  }
  if (!title) return next(new ApiError(400, 'title is required'));
  return next();
}

module.exports = { validateStaffDocument };
