const ApiError = require('../../utils/ApiError');

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return field;
    }
  }
  return null;
}

function validateAcademicYear(req, res, next) {
  const missing = requireFields(req.body || {}, ['name', 'startDate', 'endDate']);
  if (missing) return next(new ApiError(400, `${missing} is required`));
  return next();
}

function validateTerm(req, res, next) {
  const missing = requireFields(req.body || {}, ['name', 'sequence', 'startDate', 'endDate']);
  if (missing) return next(new ApiError(400, `${missing} is required`));
  if (![1, 2, 3].includes(Number(req.body.sequence))) {
    return next(new ApiError(400, 'sequence must be 1, 2, or 3'));
  }
  return next();
}

function validateClass(req, res, next) {
  const missing = requireFields(req.body || {}, ['name', 'levelId']);
  if (missing) return next(new ApiError(400, `${missing} is required`));
  return next();
}

// A class's promotion config is at most one of "promotes to X" or "graduates
// here" — never both. Applies to PATCH (create doesn't set these yet, the
// mapping is configured afterward from the Classes page).
function validateClassPromotionMapping(req, res, next) {
  const { nextClassId, isGraduatingClass } = req.body || {};
  if (nextClassId && isGraduatingClass) {
    return next(new ApiError(400, 'A class cannot both promote to another class and be marked as graduating'));
  }
  if (nextClassId && nextClassId === req.params.classId) {
    return next(new ApiError(400, 'A class cannot promote to itself'));
  }
  return next();
}

// "End of term" or "new year" isn't an audit trail — require an actual
// explanation, mirroring financials/validators.js#validatePaymentUpdate.
const MIN_REASON_WORDS = 4;

function validateSetCurrent(req, res, next) {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return next(new ApiError(400, 'reason is required'));

  const wordCount = reason.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_REASON_WORDS) {
    return next(new ApiError(400, 'reason must be more than 3 words — please explain why this is being changed'));
  }
  return next();
}

module.exports = {
  validateAcademicYear, validateTerm, validateClass, validateClassPromotionMapping, validateSetCurrent,
};
