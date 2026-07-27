const ApiError = require('../../utils/ApiError');
const { normalizeSchoolCode, isValidSchoolCode } = require('../../utils/schoolCodeGuard');
const { validateTrainingFields } = require('../../utils/trainingValidation');

function validateRegisterSchool(req, res, next) {
  const { name, adminEmail, adminPassword } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new ApiError(400, 'School name is required'));
  }
  if (!isValidSchoolCode(normalizeSchoolCode(req.body?.code))) {
    return next(new ApiError(400, 'School code is required and must be 2-3 letters/digits'));
  }
  if (!adminEmail || typeof adminEmail !== 'string') {
    return next(new ApiError(400, 'adminEmail is required'));
  }
  if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.length < 8) {
    return next(new ApiError(400, 'adminPassword is required and must be at least 8 characters'));
  }
  if (Number(req.body?.studentPopulation) < 1 || !Number.isFinite(Number(req.body?.studentPopulation))) {
    return next(new ApiError(400, 'studentPopulation is required and must be a positive number'));
  }
  const trainingError = validateTrainingFields(req.body);
  if (trainingError) {
    return next(new ApiError(400, trainingError));
  }
  return next();
}

module.exports = { validateRegisterSchool };
