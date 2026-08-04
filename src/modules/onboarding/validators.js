const ApiError = require('../../utils/ApiError');
const { normalizeSchoolCode, isValidSchoolCode } = require('../../utils/schoolCodeGuard');
const { validateTrainingFields } = require('../../utils/trainingValidation');

const ACADEMIC_YEAR_PATTERN = /^\d{4}\/\d{4}$/;

// Shared by both validateRegisterSchool (direct, unpaid endpoint) and
// validateInitializePayment (paid flow) — same required registration
// fields either way.
function findRegistrationFieldError(body) {
  const { name, adminEmail, adminPassword } = body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return 'School name is required';
  }
  if (!isValidSchoolCode(normalizeSchoolCode(body?.code))) {
    return 'School code is required and must be 2-3 letters/digits';
  }
  if (!adminEmail || typeof adminEmail !== 'string') {
    return 'adminEmail is required';
  }
  if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.length < 8) {
    return 'adminPassword is required and must be at least 8 characters';
  }
  if (Number(body?.studentPopulation) < 1 || !Number.isFinite(Number(body?.studentPopulation))) {
    return 'studentPopulation is required and must be a positive number';
  }
  return validateTrainingFields(body);
}

function validateRegisterSchool(req, res, next) {
  const error = findRegistrationFieldError(req.body);
  if (error) {
    return next(new ApiError(400, error));
  }
  return next();
}

function validateInitializePayment(req, res, next) {
  const error = findRegistrationFieldError(req.body);
  if (error) {
    return next(new ApiError(400, error));
  }
  const { academicYearName, termSequence } = req.body || {};
  if (!academicYearName || !ACADEMIC_YEAR_PATTERN.test(String(academicYearName).trim())) {
    return next(new ApiError(400, 'academicYearName is required, e.g. "2026/2027"'));
  }
  if (![1, 2, 3].includes(Number(termSequence))) {
    return next(new ApiError(400, 'termSequence must be 1, 2, or 3'));
  }
  return next();
}

module.exports = { validateRegisterSchool, validateInitializePayment };
