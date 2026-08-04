const { Role, User, RolePermission } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { ASSIGNABLE_ROLES } = require('../users/validators');

// Reserved names no custom role may take — the 6 assignable built-ins plus
// the 2 roles that exist but are never assignable through this app (see
// users/validators.js's comment on ASSIGNABLE_ROLES for why SUPER_ADMIN/
// PARENT are excluded from that list in the first place).
const RESERVED_ROLE_NAMES = [...ASSIGNABLE_ROLES, 'SUPER_ADMIN', 'PARENT'];

// Built-in roles (global rows, schoolId null) a school can assign, plus
// whatever custom roles that school has defined for itself. This is the
// list every role picker in the app (Staff login creation, Users, the User
// Access matrix) now fetches from, instead of a hardcoded array.
async function listSchoolRoles(schoolId) {
  const builtIn = await Role.findAll({
    where: { name: ASSIGNABLE_ROLES, schoolId: null },
    order: [['name', 'ASC']],
  });
  const custom = await tenantScoped(Role, schoolId).findAll({ order: [['name', 'ASC']] });

  return [
    ...builtIn.map((role) => ({
      id: role.id, name: role.name, description: role.description, isCustom: false,
    })),
    ...custom.map((role) => ({
      id: role.id, name: role.name, description: role.description, isCustom: true,
    })),
  ];
}

async function listSchoolRoleNames(schoolId) {
  return (await listSchoolRoles(schoolId)).map((role) => role.name);
}

// Letters/digits/underscore, starting with a letter, matching the style of
// every existing role name (SCHOOL_ADMIN, HEAD_TEACHER, ...). Whatever an
// admin types is normalized into this shape — e.g. "Librarian" -> "LIBRARIAN",
// "Front Desk" -> "FRONT_DESK" — since the name is also what ends up in a
// user's JWT roles array, not just a display label.
function normalizeRoleName(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function createRole(schoolId, { name, description }) {
  const normalized = normalizeRoleName(name);
  if (!normalized || !/^[A-Z][A-Z0-9_]{0,29}$/.test(normalized)) {
    throw new ApiError(400, 'Enter a role name using letters and numbers (e.g. "Librarian").');
  }
  if (RESERVED_ROLE_NAMES.includes(normalized)) {
    throw new ApiError(409, `"${normalized}" is already a built-in role name.`);
  }

  const existing = await Role.findOne({ where: { name: normalized } });
  if (existing) {
    throw new ApiError(409, `"${normalized}" is already in use — try a more specific name.`);
  }

  return tenantScoped(Role, schoolId).create({ name: normalized, description: description || null });
}

async function deleteRole(schoolId, roleId) {
  const role = await tenantScoped(Role, schoolId).findByPk(roleId);
  if (!role) throw new ApiError(404, 'Role not found');

  const holderCount = await User.count({
    where: { schoolId },
    include: [{ model: Role, where: { id: roleId }, through: { attributes: [] } }],
  });
  if (holderCount > 0) {
    throw new ApiError(
      400,
      `${holderCount} user${holderCount === 1 ? '' : 's'} still ${holderCount === 1 ? 'has' : 'have'} this role — reassign them first.`,
    );
  }

  await tenantScoped(RolePermission, schoolId).destroy({ where: { role: role.name } });
  await role.destroy();
}

module.exports = {
  listSchoolRoles, listSchoolRoleNames, createRole, deleteRole,
};
