const ApiError = require('../../utils/ApiError');

// DB-independent request-shape checks only — the real range/contiguity/
// enum checks that need the school's existing data live in service.js,
// matching gradingSettings/validators.js's split.
function validateSchemeCreate(req, res, next) {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new ApiError(400, 'name is required'));
  }
  return next();
}

function validatePerformanceLevelsUpdate(req, res, next) {
  const { levels } = req.body || {};
  if (!Array.isArray(levels) || levels.length === 0) {
    return next(new ApiError(400, 'levels is required and must be a non-empty array'));
  }
  return next();
}

const SUPPORTED_SCOPE_TYPES = ['CLASS', 'ACADEMIC_LEVEL', 'SCHOOL'];

function validateCalculationTrigger(req, res, next) {
  const { termId, scopeType, scopeRefId } = req.body || {};
  if (!termId) return next(new ApiError(400, 'termId is required'));
  if (!scopeType || !SUPPORTED_SCOPE_TYPES.includes(scopeType)) {
    return next(new ApiError(400, `scopeType is required and must be one of: ${SUPPORTED_SCOPE_TYPES.join(', ')}`));
  }
  if (scopeType !== 'SCHOOL' && !scopeRefId) {
    return next(new ApiError(400, 'scopeRefId is required for CLASS/ACADEMIC_LEVEL scope'));
  }
  return next();
}

module.exports = {
  validateSchemeCreate,
  validatePerformanceLevelsUpdate,
  validateCalculationTrigger,
};
