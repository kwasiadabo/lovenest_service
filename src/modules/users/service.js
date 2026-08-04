const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { User, Role, Staff, Parent } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'Welcome123!';

// Resolves role names to rows for this school specifically — a name match
// alone isn't enough once schools can define their own custom roles
// (modules/roles): two different schools' custom roles can share a name,
// so without the schoolId filter this could attach a user to another
// school's role row. Built-ins (schoolId null) are still visible to every
// school, same as before.
function findAssignableRoles(schoolId, names) {
  return Role.findAll({
    where: { name: names, [Op.or]: [{ schoolId: null }, { schoolId }] },
  });
}

function serializeUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    status: user.status,
    forcePasswordChange: user.forcePasswordChange,
    lastLoginAt: user.lastLoginAt,
    roles: (user.Roles || []).map((role) => role.name),
  };
}

// Every account is meant to be linked to either a Staff member or a Parent
// (see staff/service.js#createStaffLogin and students/service.js
// #createParentLogin — this list has no "create" of its own) — the one
// standing exception is the SCHOOL_ADMIN minted at school signup, which
// predates any Staff record existing to link it to.

async function countActiveSchoolAdmins(schoolId, excludeUserId) {
  return User.count({
    where: { schoolId, status: 'active' },
    include: [{ model: Role, where: { name: 'SCHOOL_ADMIN' }, through: { attributes: [] } }],
  }).then(async (count) => {
    if (!excludeUserId) return count;
    const excluded = await User.findOne({
      where: { id: excludeUserId, schoolId, status: 'active' },
      include: [{ model: Role, where: { name: 'SCHOOL_ADMIN' }, through: { attributes: [] } }],
    });
    return excluded ? count - 1 : count;
  });
}

async function listUsers(schoolId) {
  const users = await tenantScoped(User, schoolId).findAll({
    include: [{ model: Role, through: { attributes: [] } }],
    order: [['createdAt', 'DESC']],
  });

  const userIds = users.map((u) => u.id);
  const staffLinks = userIds.length
    ? await tenantScoped(Staff, schoolId).findAll({ where: { userId: userIds }, attributes: ['userId'] })
    : [];
  const parentLinks = userIds.length
    ? await tenantScoped(Parent, schoolId).findAll({ where: { userId: userIds }, attributes: ['userId'] })
    : [];
  const staffUserIds = new Set(staffLinks.map((s) => s.userId));
  const parentUserIds = new Set(parentLinks.map((p) => p.userId));

  return users.map((user) => ({
    ...serializeUser(user),
    hasStaffLink: staffUserIds.has(user.id),
    hasParentLink: parentUserIds.has(user.id),
  }));
}

async function createUser(schoolId, { fullName, email, roles }) {
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new ApiError(409, 'That email is already registered');
  }

  const roleRows = await findAssignableRoles(schoolId, roles);
  if (roleRows.length !== roles.length) {
    throw new ApiError(400, 'One or more roles could not be found');
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
  const user = await tenantScoped(User, schoolId).create({
    fullName,
    email,
    passwordHash,
    status: 'active',
    forcePasswordChange: true,
  });
  await user.setRoles(roleRows);

  return { ...serializeUser({ ...user.get(), Roles: roleRows }), defaultPassword: DEFAULT_PASSWORD };
}

async function setUserStatus(schoolId, userId, actorUserId, status) {
  if (userId === actorUserId) {
    throw new ApiError(400, 'You cannot change your own account status');
  }

  const user = await tenantScoped(User, schoolId).findByPk(userId, {
    include: [{ model: Role, through: { attributes: [] } }],
  });
  if (!user) throw new ApiError(404, 'User not found');

  const isSchoolAdmin = user.Roles.some((role) => role.name === 'SCHOOL_ADMIN');
  if (status === 'disabled' && isSchoolAdmin && user.status === 'active') {
    const remaining = await countActiveSchoolAdmins(schoolId, userId);
    if (remaining < 1) {
      throw new ApiError(400, 'A school must always have at least one System Admin');
    }
  }

  user.status = status;
  await user.save();
  return serializeUser(user);
}

async function resetUserPassword(schoolId, userId) {
  const user = await tenantScoped(User, schoolId).findByPk(userId);
  if (!user) throw new ApiError(404, 'User not found');

  user.passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
  user.forcePasswordChange = true;
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;
  await user.save();

  return { message: 'Password reset to the default password.', defaultPassword: DEFAULT_PASSWORD };
}

async function updateUserRoles(schoolId, userId, roles) {
  const user = await tenantScoped(User, schoolId).findByPk(userId, {
    include: [{ model: Role, through: { attributes: [] } }],
  });
  if (!user) throw new ApiError(404, 'User not found');

  const wasSchoolAdmin = user.Roles.some((role) => role.name === 'SCHOOL_ADMIN');
  const willBeSchoolAdmin = roles.includes('SCHOOL_ADMIN');
  if (wasSchoolAdmin && !willBeSchoolAdmin && user.status === 'active') {
    const remaining = await countActiveSchoolAdmins(schoolId, userId);
    if (remaining < 1) {
      throw new ApiError(400, 'A school must always have at least one System Admin');
    }
  }

  const roleRows = await findAssignableRoles(schoolId, roles);
  if (roleRows.length !== roles.length) {
    throw new ApiError(400, 'One or more roles could not be found');
  }

  await user.setRoles(roleRows);
  return serializeUser({ ...user.get(), Roles: roleRows });
}

module.exports = { listUsers, createUser, setUserStatus, resetUserPassword, updateUserRoles };
