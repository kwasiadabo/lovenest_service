const { Op } = require('sequelize');
const { sequelize, RolePermission } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const {
  LEVELS, LEVEL_RANK, MODULES, MODULE_KEYS, defaultLevelFor,
} = require('../../config/permissions');
const { listSchoolRoleNames } = require('../roles/service');

// Every role the matrix can show a column for, minus SCHOOL_ADMIN — it's
// never in the grid (always full access, hardcoded, so a school can never
// lock its own admins out). Includes this school's own custom roles
// (modules/roles), not just the fixed built-ins.
async function editableRoleNames(schoolId) {
  return (await listSchoolRoleNames(schoolId)).filter((role) => role !== 'SCHOOL_ADMIN');
}

// Full grid for the settings page — every (role, module) pair, even ones
// with no saved row yet (falls back to defaultLevelFor, same "resolve, don't
// eagerly persist" approach as gradingSettings#resolveGradingConfig).
async function getPermissions(schoolId) {
  const roles = await editableRoleNames(schoolId);
  const saved = await tenantScoped(RolePermission, schoolId).findAll();
  const savedByKey = new Map(saved.map((row) => [`${row.role}:${row.moduleKey}`, row.level]));

  const permissions = [];
  roles.forEach((role) => {
    MODULE_KEYS.forEach((moduleKey) => {
      permissions.push({
        role,
        moduleKey,
        level: savedByKey.get(`${role}:${moduleKey}`) || defaultLevelFor(role, moduleKey),
      });
    });
  });

  return {
    roles, modules: MODULES, levels: LEVELS, permissions,
  };
}

async function validatePermissionRows(schoolId, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ApiError(400, 'permissions must be a non-empty array');
  }
  const roles = await editableRoleNames(schoolId);
  rows.forEach((row) => {
    if (!roles.includes(row.role)) {
      throw new ApiError(400, `${row.role} is not an editable role`);
    }
    if (!MODULE_KEYS.includes(row.moduleKey)) {
      throw new ApiError(400, `${row.moduleKey} is not a known module`);
    }
    if (!LEVELS.includes(row.level)) {
      throw new ApiError(400, `level must be one of: ${LEVELS.join(', ')}`);
    }
  });
}

// Full-set replace, same destroy-then-bulkCreate transaction shape as
// gradingSettings#updateGradeBands — the whole grid is submitted and saved
// together, not row-by-row patches.
async function updatePermissions(schoolId, rows) {
  await validatePermissionRows(schoolId, rows);

  await sequelize.transaction(async (transaction) => {
    await tenantScoped(RolePermission, schoolId).destroy({ where: {}, transaction });
    await tenantScoped(RolePermission, schoolId).bulkCreate(
      rows.map((row) => ({ role: row.role, moduleKey: row.moduleKey, level: row.level })),
      { transaction },
    );
  });
  // Re-read after commit, not inside the transaction — a read through
  // tenantScoped() has no way to join the in-flight transaction here, so
  // reading before commit could miss the rows just written.
  return getPermissions(schoolId);
}

// The caller's own effective levels, one per module — max rank across every
// role they hold. Backs GET /my-permissions, open to any authenticated
// tenant user (not just SCHOOL_ADMIN like the rest of this module) since
// it's what the frontend's route/nav gating checks against for itself.
// SCHOOL_ADMIN gets MANAGE everywhere without a DB round-trip, mirroring
// permissionGuard.js's bypass.
async function getMyPermissions(schoolId, roles) {
  if (roles.includes('SCHOOL_ADMIN')) {
    return Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 'MANAGE']));
  }

  const rows = await tenantScoped(RolePermission, schoolId).findAll({
    where: { role: { [Op.in]: roles } },
  });
  const levelByKey = new Map(rows.map((row) => [`${row.role}:${row.moduleKey}`, row.level]));

  const result = {};
  MODULE_KEYS.forEach((moduleKey) => {
    const bestRank = Math.max(
      0,
      ...roles.map((role) => LEVEL_RANK[levelByKey.get(`${role}:${moduleKey}`) || defaultLevelFor(role, moduleKey)]),
    );
    result[moduleKey] = LEVELS[bestRank];
  });
  return result;
}

module.exports = { getPermissions, updatePermissions, getMyPermissions };
