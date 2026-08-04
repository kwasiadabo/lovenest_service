const { Op } = require('sequelize');
const { Staff, User, Role } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const usersService = require('../users/service');

// Never selects passwordHash/resetPasswordTokenHash — same convention as
// financials/service.js's USER_SUMMARY_ATTRIBUTES.
const USER_SUMMARY_ATTRIBUTES = ['id', 'email', 'status'];

async function listStaff(schoolId, { status } = {}) {
  return tenantScoped(Staff, schoolId).findAll({
    where: status ? { status } : undefined,
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

// Explicit field whitelist, not a raw `.update(req.body)` — schoolId/userId/
// status/separation* are owned by tenantScoped's own schoolId enforcement
// and by the dedicated createStaffLogin/linkStaffToExistingUser/
// separateStaffMember/reactivateStaffMember workflows respectively; letting
// this endpoint set them directly would let a caller reassign a staff row
// to another school or user, or silently flip separation state.
async function updateStaffMember(schoolId, staffId, {
  fullName, phone, email, gender, dateOfBirth, dateHired, position, staffType, qualification,
  bankName, bankBranch, bankAccountNumber, bankAccountName, ssnitNumber, ghanaCardNumber,
}) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  await staff.update(normalizeStaffType({
    fullName, phone, email, gender, dateOfBirth, dateHired, position, staffType, qualification,
    bankName, bankBranch, bankAccountNumber, bankAccountName, ssnitNumber, ghanaCardNumber,
  }));
  return staff;
}

async function deleteStaffMember(schoolId, staffId) {
  const deleted = await tenantScoped(Staff, schoolId).destroy({ where: { id: staffId } });
  if (!deleted) throw new ApiError(404, 'Staff member not found');
}

async function separateStaffMember(schoolId, staffId, {
  separationType, separationReason, lastWorkingDay, rehireEligible,
}) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  if (!Staff.SEPARATION_TYPES.includes(separationType)) {
    throw new ApiError(400, `separationType must be one of: ${Staff.SEPARATION_TYPES.join(', ')}`);
  }

  await staff.update({
    status: 'SEPARATED',
    separationType,
    separationReason: separationReason || null,
    lastWorkingDay: lastWorkingDay || null,
    rehireEligible: rehireEligible ?? null,
  });
  return staff;
}

async function reactivateStaffMember(schoolId, staffId) {
  const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
  if (!staff) throw new ApiError(404, 'Staff member not found');
  await staff.update({ status: 'ACTIVE' });
  return staff;
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

// ---- Staff attrition analytics ----
// Same shape/rationale as attendance/service.js#getAttendanceAnalytics: one
// query, in-memory bucketing (no raw SQL/Sequelize GROUP BY), sorted arrays
// out. Bucketed by calendar month across the from/to range (default: the
// last 12 months, ending today). dateHired/lastWorkingDay are DATEONLY
// columns ("YYYY-MM-DD"), so lexicographic string comparison against another
// DATEONLY string is a safe, calendar-correct ordering — no Date parsing
// needed for the comparisons themselves.

function toDateOnlyString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Parses a DATEONLY string ("YYYY-MM-DD") as a local calendar date, not
// UTC — same rationale as the frontend's lib/formatDate.js#parseLocalDate.
function parseDateOnly(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function endOfMonthString(year, month) {
  return toDateOnlyString(new Date(year, month + 1, 0));
}

function startOfMonthString(year, month) {
  return toDateOnlyString(new Date(year, month, 1));
}

// Last 12 calendar months, ending with the current month.
function defaultAttritionRange() {
  const now = new Date();
  const from = toDateOnlyString(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  const to = toDateOnlyString(now);
  return { from, to };
}

// Every calendar month touched by [from, to], inclusive.
function buildMonthBuckets(from, to) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  const buckets = [];
  let year = start.getFullYear();
  let month = start.getMonth();
  const lastYear = end.getFullYear();
  const lastMonth = end.getMonth();
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    buckets.push({ year, month });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return buckets;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

async function getStaffAttritionAnalytics(schoolId, { from, to } = {}) {
  const range = from && to ? { from, to } : defaultAttritionRange();

  // All statuses — separated staff's dateHired/lastWorkingDay feed both the
  // historical headcount-as-of-each-month-end figure and the separations
  // numerator, so they can't be excluded the way an "active roster" query
  // would.
  const staffList = await tenantScoped(Staff, schoolId).findAll({
    attributes: ['id', 'dateHired', 'status', 'lastWorkingDay', 'separationType'],
  });

  const monthlyTrend = buildMonthBuckets(range.from, range.to).map(({ year, month }) => {
    const monthStart = startOfMonthString(year, month);
    const monthEnd = endOfMonthString(year, month);

    const headcountEnd = staffList.filter((s) => {
      if (s.dateHired > monthEnd) return false;
      if (s.status === 'ACTIVE') return true;
      return Boolean(s.lastWorkingDay) && s.lastWorkingDay > monthEnd;
    }).length;

    const separations = staffList.filter((s) => (
      s.status === 'SEPARATED'
      && s.lastWorkingDay
      && s.lastWorkingDay >= monthStart
      && s.lastWorkingDay <= monthEnd
    )).length;

    return {
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      headcountEnd,
      separations,
      turnoverRatePercent: headcountEnd > 0 ? round1((separations / headcountEnd) * 100) : 0,
    };
  });

  const separationsInRange = staffList.filter((s) => (
    s.status === 'SEPARATED'
    && s.lastWorkingDay
    && s.lastWorkingDay >= range.from
    && s.lastWorkingDay <= range.to
  ));

  const currentActiveHeadcount = staffList.filter((s) => s.status === 'ACTIVE').length;
  const totalSeparationsInRange = separationsInRange.length;
  const overallTurnoverRatePercent = currentActiveHeadcount > 0
    ? round1((totalSeparationsInRange / currentActiveHeadcount) * 100)
    : 0;

  const separationTypeBreakdown = Staff.SEPARATION_TYPES.map((separationType) => ({
    separationType,
    count: separationsInRange.filter((s) => s.separationType === separationType).length,
  }));

  return {
    scope: { from: range.from, to: range.to },
    summary: {
      currentActiveHeadcount,
      totalSeparationsInRange,
      overallTurnoverRatePercent,
    },
    monthlyTrend,
    separationTypeBreakdown,
  };
}

module.exports = {
  listStaff,
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
  separateStaffMember,
  reactivateStaffMember,
  createStaffLogin,
  resetStaffLoginPassword,
  linkStaffToExistingUser,
  listUnlinkedNonParentUsers,
  getStaffAttritionAnalytics,
};
