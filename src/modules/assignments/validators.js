const ApiError = require('../../utils/ApiError');

function validateSubjectTeacher(req, res, next) {
  const { classId, subjectId, staffId } = req.body || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!subjectId) return next(new ApiError(400, 'subjectId is required'));
  if (!staffId) return next(new ApiError(400, 'staffId is required'));
  return next();
}

function validateClassTeacher(req, res, next) {
  const { classId, staffId } = req.body || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!staffId) return next(new ApiError(400, 'staffId is required'));
  return next();
}

module.exports = { validateSubjectTeacher, validateClassTeacher };
