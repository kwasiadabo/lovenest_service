const ApiError = require('../../utils/ApiError');
const { StaffAppraisal } = require('../../models');

function validateStaffAppraisal(req, res, next) {
  const {
    reviewerStaffId, reviewDate, rating,
  } = req.body || {};
  if (!reviewerStaffId) return next(new ApiError(400, 'reviewerStaffId is required'));
  if (!reviewDate) return next(new ApiError(400, 'reviewDate is required'));
  if (!rating) return next(new ApiError(400, 'rating is required'));
  if (!StaffAppraisal.RATINGS.includes(rating)) {
    return next(new ApiError(400, `rating must be one of: ${StaffAppraisal.RATINGS.join(', ')}`));
  }
  return next();
}

module.exports = { validateStaffAppraisal };
