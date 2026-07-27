const { StaffDuty, DutyRoster, Staff } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

// ---- Staff Duty (setup) ----

async function listStaffDuties(schoolId) {
  return tenantScoped(StaffDuty, schoolId).findAll({ order: [['name', 'ASC']] });
}

async function createStaffDuty(schoolId, { name, description }) {
  return tenantScoped(StaffDuty, schoolId).create({ name, description });
}

async function updateStaffDuty(schoolId, dutyId, data) {
  const duty = await tenantScoped(StaffDuty, schoolId).findByPk(dutyId);
  if (!duty) throw new ApiError(404, 'Staff duty not found');
  await duty.update(data);
  return duty;
}

async function deleteStaffDuty(schoolId, dutyId) {
  const deleted = await tenantScoped(StaffDuty, schoolId).destroy({ where: { id: dutyId } });
  if (!deleted) throw new ApiError(404, 'Staff duty not found');
}

// ---- Duty Roster ----

const rosterInclude = [{ model: StaffDuty, as: 'duty' }, Staff];

async function listDutyRoster(schoolId, { date, dutyId, staffId } = {}) {
  const where = {};
  if (date) where.date = date;
  if (dutyId) where.dutyId = dutyId;
  if (staffId) where.staffId = staffId;

  return tenantScoped(DutyRoster, schoolId).findAll({
    where,
    include: rosterInclude,
    order: [['date', 'DESC']],
  });
}

async function createDutyRosterEntry(schoolId, { dutyId, staffId, date }) {
  const duty = await tenantScoped(StaffDuty, schoolId).findByPk(dutyId);
  if (!duty) throw new ApiError(404, 'Staff duty not found');

  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');

  const existing = await tenantScoped(DutyRoster, schoolId).findOne({ where: { dutyId, staffId, date } });
  if (existing) {
    throw new ApiError(409, 'This staff member is already assigned to this duty on this date');
  }

  const created = await tenantScoped(DutyRoster, schoolId).create({ dutyId, staffId, date });
  return tenantScoped(DutyRoster, schoolId).findByPk(created.id, { include: rosterInclude });
}

async function deleteDutyRosterEntry(schoolId, id) {
  const deleted = await tenantScoped(DutyRoster, schoolId).destroy({ where: { id } });
  if (!deleted) throw new ApiError(404, 'Roster entry not found');
}

module.exports = {
  listStaffDuties,
  createStaffDuty,
  updateStaffDuty,
  deleteStaffDuty,
  listDutyRoster,
  createDutyRosterEntry,
  deleteDutyRosterEntry,
};
