const { StaffAppraisal, Staff } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

const REVIEWER_INCLUDE = [{ model: Staff, as: 'reviewer', attributes: ['id', 'fullName'] }];

async function assertStaffExists(schoolId, staffId) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  return staff;
}

async function listStaffAppraisals(schoolId, staffId) {
  await assertStaffExists(schoolId, staffId);
  return tenantScoped(StaffAppraisal, schoolId).findAll({
    where: { staffId },
    include: REVIEWER_INCLUDE,
    order: [['reviewDate', 'DESC']],
  });
}

async function createStaffAppraisal(schoolId, staffId, data) {
  await assertStaffExists(schoolId, staffId);

  if (!data.reviewerStaffId) throw new ApiError(400, 'reviewerStaffId is required');
  await assertStaffExists(schoolId, data.reviewerStaffId);

  if (!data.reviewDate) throw new ApiError(400, 'reviewDate is required');

  if (!StaffAppraisal.RATINGS.includes(data.rating)) {
    throw new ApiError(400, `rating must be one of: ${StaffAppraisal.RATINGS.join(', ')}`);
  }

  const appraisal = await tenantScoped(StaffAppraisal, schoolId).create({
    staffId,
    reviewerStaffId: data.reviewerStaffId,
    reviewDate: data.reviewDate,
    rating: data.rating,
    comments: data.comments || null,
  });

  return tenantScoped(StaffAppraisal, schoolId).findByPk(appraisal.id, { include: REVIEWER_INCLUDE });
}

async function deleteStaffAppraisal(schoolId, staffId, appraisalId) {
  const deleted = await tenantScoped(StaffAppraisal, schoolId).destroy({ where: { id: appraisalId, staffId } });
  if (!deleted) throw new ApiError(404, 'Staff appraisal not found');
}

module.exports = {
  listStaffAppraisals,
  createStaffAppraisal,
  deleteStaffAppraisal,
};
