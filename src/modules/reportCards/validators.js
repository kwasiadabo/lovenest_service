const ApiError = require('../../utils/ApiError');
const {
  GENERAL_COMMENTS_FIELDS, LEARNING_BEHAVIOUR_FIELDS, GROWTH_MINDSET_FIELDS,
  validateProgressValues, validateCommentValues,
} = require('./behaviorFields');

const PROMOTION_STATUSES = ['PROMOTED', 'REPEATED', 'NOT_APPLICABLE'];

function validateGenerateQuery(req, res, next) {
  const { studentId, termId } = req.query || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  return next();
}

function validateClassSummaryQuery(req, res, next) {
  const { classId, termId } = req.query || {};
  if (!classId) return next(new ApiError(400, 'classId is required'));
  if (!termId) return next(new ApiError(400, 'termId is required'));
  return next();
}

function validateRemarksUpdate(req, res, next) {
  const {
    promotionStatus, behaviorProgress, generalComments, learningBehaviourComments, growthMindsetComments,
  } = req.body || {};
  if (promotionStatus !== undefined && !PROMOTION_STATUSES.includes(promotionStatus)) {
    return next(new ApiError(400, `promotionStatus must be one of: ${PROMOTION_STATUSES.join(', ')}`));
  }
  if (behaviorProgress !== undefined) {
    const error = validateProgressValues(behaviorProgress);
    if (error) return next(new ApiError(400, `behaviorProgress: ${error}`));
  }
  if (generalComments !== undefined) {
    const error = validateCommentValues(generalComments, GENERAL_COMMENTS_FIELDS);
    if (error) return next(new ApiError(400, `generalComments: ${error}`));
  }
  if (learningBehaviourComments !== undefined) {
    const error = validateCommentValues(learningBehaviourComments, LEARNING_BEHAVIOUR_FIELDS);
    if (error) return next(new ApiError(400, `learningBehaviourComments: ${error}`));
  }
  if (growthMindsetComments !== undefined) {
    const error = validateCommentValues(growthMindsetComments, GROWTH_MINDSET_FIELDS);
    if (error) return next(new ApiError(400, `growthMindsetComments: ${error}`));
  }
  return next();
}

function validateHeadteacherRemarkUpdate(req, res, next) {
  const { headteacherRemark } = req.body || {};
  if (headteacherRemark !== undefined && typeof headteacherRemark !== 'string') {
    return next(new ApiError(400, 'headteacherRemark must be a string'));
  }
  return next();
}

function validateClassNextTermStartDateUpdate(req, res, next) {
  const { nextTermStartDate } = req.body || {};
  if (!nextTermStartDate || Number.isNaN(Date.parse(nextTermStartDate))) {
    return next(new ApiError(400, 'nextTermStartDate must be a valid date'));
  }
  return next();
}

module.exports = {
  validateGenerateQuery,
  validateClassSummaryQuery,
  validateRemarksUpdate,
  validateHeadteacherRemarkUpdate,
  validateClassNextTermStartDateUpdate,
  PROMOTION_STATUSES,
};
