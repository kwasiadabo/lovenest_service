const ApiError = require('../../utils/ApiError');
const { normalizeSchoolCode, isValidSchoolCode } = require('../../utils/schoolCodeGuard');
const { validateTrainingFields } = require('../../utils/trainingValidation');

function validateProvisionSchool(req, res, next) {
  const { name, adminEmail, adminPassword } = req.body || {};
  if (!name || typeof name !== 'string') {
    return next(new ApiError(400, 'name is required'));
  }
  if (!isValidSchoolCode(normalizeSchoolCode(req.body?.code))) {
    return next(new ApiError(400, 'code is required and must be 2-3 letters/digits'));
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

function validateUpdateSchool(req, res, next) {
  const { name, studentPopulation } = req.body || {};
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new ApiError(400, 'name must be a non-empty string'));
  }
  if (
    studentPopulation !== undefined
    && studentPopulation !== ''
    && (Number(studentPopulation) < 1 || !Number.isFinite(Number(studentPopulation)))
  ) {
    return next(new ApiError(400, 'studentPopulation must be a positive number'));
  }
  return next();
}

function validateSetStatus(req, res, next) {
  const { status } = req.body || {};
  if (!['pending', 'trial', 'active', 'suspended'].includes(status)) {
    return next(new ApiError(400, 'status must be one of pending, trial, active, suspended'));
  }
  return next();
}

function validateTenantActionNote(req, res, next) {
  const { note } = req.body || {};
  if (note !== undefined && typeof note !== 'string') {
    return next(new ApiError(400, 'note must be a string'));
  }
  return next();
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateSsnitRate(req, res, next) {
  const { employeeRatePercent, employerRatePercent, effectiveFrom } = req.body || {};
  if (typeof employeeRatePercent !== 'number' || employeeRatePercent < 0 || employeeRatePercent > 100) {
    return next(new ApiError(400, 'employeeRatePercent must be a number between 0 and 100'));
  }
  if (typeof employerRatePercent !== 'number' || employerRatePercent < 0 || employerRatePercent > 100) {
    return next(new ApiError(400, 'employerRatePercent must be a number between 0 and 100'));
  }
  if (!effectiveFrom || !DATE_ONLY_PATTERN.test(effectiveFrom)) {
    return next(new ApiError(400, 'effectiveFrom is required and must be a YYYY-MM-DD date'));
  }
  return next();
}

function validatePayeTaxBands(req, res, next) {
  const { effectiveFrom, bands } = req.body || {};
  if (!effectiveFrom || !DATE_ONLY_PATTERN.test(effectiveFrom)) {
    return next(new ApiError(400, 'effectiveFrom is required and must be a YYYY-MM-DD date'));
  }
  if (!Array.isArray(bands) || bands.length === 0) {
    return next(new ApiError(400, 'bands must be a non-empty array'));
  }
  for (const band of bands) {
    if (typeof band.ratePercent !== 'number' || band.ratePercent < 0 || band.ratePercent > 100) {
      return next(new ApiError(400, 'Each band requires a ratePercent between 0 and 100'));
    }
    const hasUpTo = band.upToPesewas !== null && band.upToPesewas !== undefined;
    if (hasUpTo && (typeof band.upToPesewas !== 'number' || band.upToPesewas <= 0)) {
      return next(new ApiError(400, "Each band's upToPesewas must be a positive number, or null/omitted for the top band"));
    }
  }
  const onlyLastIsUnbounded = bands.slice(0, -1).every((b) => b.upToPesewas !== null && b.upToPesewas !== undefined);
  if (!onlyLastIsUnbounded) {
    return next(new ApiError(400, 'Only the last band may be unbounded (null upToPesewas)'));
  }
  return next();
}

module.exports = {
  validateProvisionSchool,
  validateUpdateSchool,
  validateSetStatus,
  validateTenantActionNote,
  validateSsnitRate,
  validatePayeTaxBands,
};
