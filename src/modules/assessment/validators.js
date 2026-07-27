const ApiError = require('../../utils/ApiError');

const ITEM_TYPES = ['CLASSWORK', 'PROJECT'];

// RAW: teacher types marks on a common 0-100 scale for both fields, and the
// server scales each down to its weight. WEIGHTED: teacher types the final
// weighted contribution directly (already within the school's CA/exam
// weight ceiling), no scaling applied. The teacher picks explicitly via a
// toggle — the server no longer guesses which convention a number is in.
// RAW's ceiling is always 100 regardless of weighting, so it's checked here;
// WEIGHTED's ceiling depends on the school's configurable caWeight/examWeight
// (see gradingSettings/service.js), which requires a DB lookup — validators
// in this codebase stay synchronous/no-DB-access, so that check happens in
// assessment/service.js#saveExamScore instead, once schoolId is available.
const ENTRY_MODES = ['RAW', 'WEIGHTED'];
const RAW_MAX = 100;

function validateAssessmentItem(req, res, next) {
  const {
    classId, subjectId, termId, type, name, maxScore,
  } = req.body || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!subjectId) return next(new ApiError(400, 'subjectId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  if (!ITEM_TYPES.includes(type)) return next(new ApiError(400, `type must be one of: ${ITEM_TYPES.join(', ')}`));
  if (!name || typeof name !== 'string' || !name.trim()) return next(new ApiError(400, 'name is required'));
  if (maxScore === undefined || maxScore === null || Number.isNaN(Number(maxScore)) || Number(maxScore) <= 0) {
    return next(new ApiError(400, 'maxScore is required and must be greater than 0'));
  }
  return next();
}

function validateScoreUpsert(req, res, next) {
  const { rawScore } = req.body || {};
  if (rawScore !== null && rawScore !== undefined && Number.isNaN(Number(rawScore))) {
    return next(new ApiError(400, 'rawScore must be a number or null'));
  }
  return next();
}

function validateExamScoreSave(req, res, next) {
  const {
    classId, subjectId, termId, studentId, classworkRaw, examRaw, entryMode,
  } = req.body || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!subjectId) return next(new ApiError(400, 'subjectId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!ENTRY_MODES.includes(entryMode)) {
    return next(new ApiError(400, `entryMode must be one of: ${ENTRY_MODES.join(', ')}`));
  }

  // WEIGHTED's upper bound is school-specific and checked later in
  // service.js#saveExamScore — here we only confirm both are non-negative
  // numbers; RAW's fixed 0-100 ceiling is fully checked here since it never
  // depends on the school's configured weights.
  const caMax = entryMode === 'RAW' ? RAW_MAX : Infinity;
  const examMax = entryMode === 'RAW' ? RAW_MAX : Infinity;
  if (
    classworkRaw === undefined || classworkRaw === null || Number.isNaN(Number(classworkRaw))
    || Number(classworkRaw) < 0 || Number(classworkRaw) > caMax
  ) {
    return next(new ApiError(400, `classworkRaw is required and must be between 0 and ${caMax} for ${entryMode.toLowerCase()} entry`));
  }
  if (
    examRaw === undefined || examRaw === null || Number.isNaN(Number(examRaw))
    || Number(examRaw) < 0 || Number(examRaw) > examMax
  ) {
    return next(new ApiError(400, `examRaw is required and must be between 0 and ${examMax} for ${entryMode.toLowerCase()} entry`));
  }
  return next();
}

function validateExamScoreScope(req, res, next) {
  const { classId, subjectId, termId } = req.body || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!subjectId) return next(new ApiError(400, 'subjectId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  return next();
}

module.exports = {
  validateAssessmentItem, validateScoreUpsert, validateExamScoreSave, validateExamScoreScope, ENTRY_MODES,
};
