const ApiError = require('../../utils/ApiError');

// Weight-sum/contiguity checks need the school's existing bands and touch the
// DB (see service.js#updateWeights/#updateGradeBands) — this module's
// validators only do request-shape checks, matching the rest of the codebase's
// convention (validators stay synchronous, no-DB-access).
function validateWeightsUpdate(req, res, next) {
  const { caWeight, examWeight } = req.body || {};
  if (caWeight === undefined || caWeight === null || Number.isNaN(Number(caWeight))) {
    return next(new ApiError(400, 'caWeight is required and must be a number'));
  }
  if (examWeight === undefined || examWeight === null || Number.isNaN(Number(examWeight))) {
    return next(new ApiError(400, 'examWeight is required and must be a number'));
  }
  return next();
}

function validateGradeBandsUpdate(req, res, next) {
  const { bands } = req.body || {};
  if (!Array.isArray(bands) || bands.length === 0) {
    return next(new ApiError(400, 'bands is required and must be a non-empty array'));
  }
  return next();
}

// classworkSourceMode/weight-sum checks are DB-independent but kept in
// service.js#updateClassworkSource anyway, matching this module's existing
// split (see the file-level comment above) — this validator only confirms
// the request shape.
function validateClassworkSourceUpdate(req, res, next) {
  const { classworkSourceMode, classworkWeight, projectWeight } = req.body || {};
  if (!classworkSourceMode || typeof classworkSourceMode !== 'string') {
    return next(new ApiError(400, 'classworkSourceMode is required'));
  }
  if (classworkWeight === undefined || classworkWeight === null || Number.isNaN(Number(classworkWeight))) {
    return next(new ApiError(400, 'classworkWeight is required and must be a number'));
  }
  if (projectWeight === undefined || projectWeight === null || Number.isNaN(Number(projectWeight))) {
    return next(new ApiError(400, 'projectWeight is required and must be a number'));
  }
  return next();
}

module.exports = { validateWeightsUpdate, validateGradeBandsUpdate, validateClassworkSourceUpdate };
