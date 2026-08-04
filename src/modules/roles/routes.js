const express = require('express');
const controller = require('./controller');
const { validateCreateRole } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// SCHOOL_ADMIN only — same consumers/gating as today (Users page, Staff
// login creation, the User Access matrix all already require SCHOOL_ADMIN).
const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/roles', adminOnly, controller.listRoles);
router.post('/roles', adminOnly, validateCreateRole, controller.createRole);
router.delete('/roles/:roleId', adminOnly, controller.deleteRole);

module.exports = router;
