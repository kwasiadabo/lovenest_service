const { Op } = require('sequelize');
const { StaffLeaveRequest, Staff, User } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

// Every self-service function below scopes to whichever Staff row is linked
// to the caller's own login — same tenantScoped(Staff).findOne({where:
// {userId}}) idiom used throughout assessment/attendance/activities for "my
// own" endpoints. A user with no linked Staff record (e.g. a SCHOOL_ADMIN
// login that isn't itself a staff member) simply can't have leave requests.
async function getOwnStaffId(schoolId, userId) {
  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  if (!staffMember) {
    throw new ApiError(403, 'No staff record is linked to your account.');
  }
  return staffMember.id;
}

function requireFields({
  requestType, leaveType, startDate, endDate, reason,
}) {
  if (!StaffLeaveRequest.REQUEST_TYPES.includes(requestType)) {
    throw new ApiError(400, `requestType must be one of: ${StaffLeaveRequest.REQUEST_TYPES.join(', ')}`);
  }
  if (requestType === 'LEAVE' && !StaffLeaveRequest.LEAVE_TYPES.includes(leaveType)) {
    throw new ApiError(400, `leaveType must be one of: ${StaffLeaveRequest.LEAVE_TYPES.join(', ')} when requestType is LEAVE`);
  }
  if (!startDate) throw new ApiError(400, 'startDate is required');
  if (!endDate) throw new ApiError(400, 'endDate is required');
  if (new Date(endDate) < new Date(startDate)) throw new ApiError(400, 'endDate cannot be before startDate');
  if (!reason || !reason.trim()) throw new ApiError(400, 'reason is required');
}

// Blocks a LEAVE request from overlapping an already-APPROVED LEAVE for the
// same staff member — cheap findOne guard, same idea as the timetable
// module's save-time conflict check. Doesn't apply to DUTY_EXCUSE: that's a
// single-slot ask against one date, not an absence range, so more than one
// pending/approved at once isn't actually contradictory.
async function assertNoOverlap(schoolId, staffId, requestType, startDate, endDate, excludeId) {
  if (requestType !== 'LEAVE') return;
  const where = {
    staffId,
    requestType: 'LEAVE',
    status: 'APPROVED',
    startDate: { [Op.lte]: endDate },
    endDate: { [Op.gte]: startDate },
  };
  // Only exclude by id when re-checking an existing request (approval path)
  // — `id: { [Op.ne]: undefined }` would otherwise be built for a brand new
  // request with no id yet, and SQL's three-valued logic makes `<> NULL`
  // (or comparing against undefined) silently match nothing at all.
  if (excludeId) where.id = { [Op.ne]: excludeId };

  const overlap = await tenantScoped(StaffLeaveRequest, schoolId).findOne({ where });
  if (overlap) {
    throw new ApiError(409, 'This overlaps a leave request that has already been approved for this staff member.');
  }
}

async function listMyLeaveRequests(schoolId, userId) {
  const staffId = await getOwnStaffId(schoolId, userId);
  return tenantScoped(StaffLeaveRequest, schoolId).findAll({
    where: { staffId },
    order: [['createdAt', 'DESC']],
  });
}

async function createMyLeaveRequest(schoolId, userId, data) {
  const staffId = await getOwnStaffId(schoolId, userId);
  requireFields(data);
  await assertNoOverlap(schoolId, staffId, data.requestType, data.startDate, data.endDate);

  return tenantScoped(StaffLeaveRequest, schoolId).create({
    staffId,
    requestType: data.requestType,
    leaveType: data.requestType === 'LEAVE' ? data.leaveType : null,
    startDate: data.startDate,
    endDate: data.endDate,
    reason: data.reason.trim(),
    status: 'PENDING',
    requestedByUserId: userId,
  });
}

// Admin/HR view of one staff member's full request history — mirrors
// StaffProfilePage's other tabs (Contracts/Appraisals), reached from the
// staff profile rather than self-service.
async function listStaffLeaveRequests(schoolId, staffId) {
  return tenantScoped(StaffLeaveRequest, schoolId).findAll({
    where: { staffId },
    include: [
      { model: User, as: 'requestedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'decidedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
    order: [['createdAt', 'DESC']],
  });
}

async function updateLeaveRequestStatus(schoolId, id, userId, { status, decisionNotes }) {
  if (!['APPROVED', 'DENIED'].includes(status)) {
    throw new ApiError(400, 'status must be APPROVED or DENIED');
  }
  const request = await tenantScoped(StaffLeaveRequest, schoolId).findByPk(id);
  if (!request) throw new ApiError(404, 'Leave request not found');
  if (request.status !== 'PENDING') {
    throw new ApiError(409, 'This request has already been decided.');
  }
  if (status === 'APPROVED') {
    await assertNoOverlap(schoolId, request.staffId, request.requestType, request.startDate, request.endDate, request.id);
  }

  request.status = status;
  request.decidedByUserId = userId;
  request.decidedAt = new Date();
  request.decisionNotes = decisionNotes || null;
  await request.save();
  return request;
}

module.exports = {
  listMyLeaveRequests,
  createMyLeaveRequest,
  listStaffLeaveRequests,
  updateLeaveRequestStatus,
};
