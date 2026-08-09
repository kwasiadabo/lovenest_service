const ApiError = require('../../utils/ApiError');
const { StaffLeaveRequest } = require('../../models');

function validateLeaveRequest(req, res, next) {
  const {
    requestType, leaveType, startDate, endDate, reason,
  } = req.body || {};

  if (!requestType || !StaffLeaveRequest.REQUEST_TYPES.includes(requestType)) {
    return next(new ApiError(400, `requestType must be one of: ${StaffLeaveRequest.REQUEST_TYPES.join(', ')}`));
  }
  if (requestType === 'LEAVE' && !StaffLeaveRequest.LEAVE_TYPES.includes(leaveType)) {
    return next(new ApiError(400, `leaveType must be one of: ${StaffLeaveRequest.LEAVE_TYPES.join(', ')} when requestType is LEAVE`));
  }
  if (!startDate) return next(new ApiError(400, 'startDate is required'));
  if (!endDate) return next(new ApiError(400, 'endDate is required'));
  if (!reason || !String(reason).trim()) return next(new ApiError(400, 'reason is required'));

  return next();
}

function validateLeaveDecision(req, res, next) {
  const { status } = req.body || {};
  if (!status || !['APPROVED', 'DENIED'].includes(status)) {
    return next(new ApiError(400, 'status must be APPROVED or DENIED'));
  }
  return next();
}

module.exports = { validateLeaveRequest, validateLeaveDecision };
