const { Op } = require('sequelize');
const { RolePermission } = require('../models');
const ApiError = require('../utils/ApiError');
const tenantScoped = require('../utils/tenantScopedModel');
const { LEVEL_RANK, defaultLevelFor } = require('../config/permissions');

// Route guard for the editable role -> module access matrix (Users -> User
// Access). Sibling to roleGuard.js's requireRole, and runs the same place in
// the chain (after authenticate/requireTenant) — the difference is the
// allowed-or-not answer is looked up per school from role_permissions
// instead of being a hardcoded role list, so a SCHOOL_ADMIN's edits take
// effect on the very next request (roles themselves are still read from the
// JWT via req.auth.roles, same as requireRole — only the *level a role
// grants* is looked up live).
//
// SCHOOL_ADMIN always bypasses — it is never stored in role_permissions (see
// config/permissions.js's EDITABLE_ROLES) so a school can never lock its own
// admins out.
function requirePermission(moduleKey, minLevel) {
  const minRank = LEVEL_RANK[minLevel];

  return async (req, res, next) => {
    try {
      const roles = (req.auth && req.auth.roles) || [];
      if (roles.includes('SCHOOL_ADMIN')) return next();

      const rows = await tenantScoped(RolePermission, req.schoolId).findAll({
        where: { moduleKey, role: { [Op.in]: roles } },
      });
      const levelByRole = new Map(rows.map((row) => [row.role, row.level]));

      const bestRank = Math.max(
        0,
        ...roles.map((role) => LEVEL_RANK[levelByRole.get(role) || defaultLevelFor(role, moduleKey)]),
      );

      if (bestRank < minRank) {
        return next(new ApiError(403, 'Insufficient access for this action'));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requirePermission };
