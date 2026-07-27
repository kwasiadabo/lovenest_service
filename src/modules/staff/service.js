const { Op } = require('sequelize');
const { Staff, User, Role } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const usersService = require('../users/service');

// Never selects passwordHash/resetPasswordTokenHash — same convention as
// financials/service.js's USER_SUMMARY_ATTRIBUTES.
const USER_SUMMARY_ATTRIBUTES = ['id', 'email', 'status'];

async function listStaff(schoolId) {
  return tenantScoped(Staff, schoolId).findAll({
    order: [['fullName', 'ASC']],
    include: [{ model: User, attributes: USER_SUMMARY_ATTRIBUTES }],
  });
}

// staffType is implied by certain positions (Headteacher/Headmaster/
// Assistant.../Teacher) rather than an independent choice — enforced here
// so it holds regardless of what a client actually submits, not just
// whatever the staff form's UI happens to send.
function normalizeStaffType(data) {
  if (data.position && Staff.TEACHING_POSITIONS.includes(data.position)) {
    return { ...data, staffType: 'TEACHING' };
  }
  return data;
}

async function createStaffMember(schoolId, data) {
  return tenantScoped(Staff, schoolId).create(normalizeStaffType(data));
}

async function updateStaffMember(schoolId, staffId, data) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  await staff.update(normalizeStaffType(data));
  return staff;
}

async function deleteStaffMember(schoolId, staffId) {
  const deleted = await tenantScoped(Staff, schoolId).destroy({ where: { id: staffId } });
  if (!deleted) throw new ApiError(404, 'Staff member not found');
}

// ---- Staff logins ----
// A User account is how a staff member actually signs in; Staff.userId is
// the link. Every non-PARENT account is meant to originate here (or via
// linkExistingUser below) rather than a free-standing "create user" —
// mirrors students/service.js#createParentLogin exactly, just keyed off
// Staff instead of Parent, with roles chosen by the admin instead of a
// hardcoded ['PARENT'].

async function createStaffLogin(schoolId, staffId, roles) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  if (!staff.email) {
    throw new ApiError(400, 'This staff member has no email on file. Add one before creating a login.');
  }
  if (staff.userId) {
    throw new ApiError(409, 'This staff member already has a login. Use "Reset password" instead.');
  }

  const created = await usersService.createUser(schoolId, { fullName: staff.fullName, email: staff.email, roles });
  await staff.update({ userId: created.id });
  return created;
}

async function resetStaffLoginPassword(schoolId, staffId) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  if (!staff.userId) throw new ApiError(400, 'This staff member does not have a login yet.');
  return usersService.resetUserPassword(schoolId, staff.userId);
}

// For an account that already exists without a Staff link (e.g. one created
// before this feature, or before its matching Staff profile existed) —
// attaches it instead of minting a new one. Refuses PARENT-role accounts
// (those belong on a Parent record, never Staff) and accounts already
// claimed by another staff member.
async function linkStaffToExistingUser(schoolId, staffId, userId) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  if (staff.userId) throw new ApiError(409, 'This staff member already has a login.');

  const user = await tenantScoped(User, schoolId).findByPk(userId, {
    include: [{ model: Role, through: { attributes: [] } }],
  });
  if (!user) throw new ApiError(404, 'User not found');
  if (user.Roles.some((role) => role.name === 'PARENT')) {
    throw new ApiError(400, 'Parent accounts cannot be linked to a staff member.');
  }

  const alreadyLinked = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  if (alreadyLinked) throw new ApiError(409, 'That account is already linked to another staff member.');

  await staff.update({ userId });
  return staff;
}

// Candidates for linkStaffToExistingUser above: non-PARENT accounts with no
// Staff row pointing to them yet (the bootstrap SCHOOL_ADMIN created at
// school signup is the usual example — it's exempt from needing a Staff
// link, but can still be attached to one here if the admin wants to).
async function listUnlinkedNonParentUsers(schoolId) {
  const users = await tenantScoped(User, schoolId).findAll({
    include: [{ model: Role, through: { attributes: [] } }],
    order: [['email', 'ASC']],
  });
  const linkedUserIds = new Set(
    (await tenantScoped(Staff, schoolId).findAll({ where: { userId: { [Op.ne]: null } }, attributes: ['userId'] }))
      .map((s) => s.userId),
  );

  return users
    .filter((u) => !u.Roles.some((role) => role.name === 'PARENT') && !linkedUserIds.has(u.id))
    .map((u) => ({
      id: u.id, fullName: u.fullName, email: u.email, roles: u.Roles.map((r) => r.name),
    }));
}

module.exports = {
  listStaff,
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
  createStaffLogin,
  resetStaffLoginPassword,
  linkStaffToExistingUser,
  listUnlinkedNonParentUsers,
};
