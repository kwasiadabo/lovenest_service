const express = require('express');
const controller = require('./controller');
const { validateUpdatePermissions } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

// SCHOOL_ADMIN only, both read and write — same gating as today's
// /admin/user-access route (App.jsx), so this doesn't expose the matrix any
// more widely than the page that shows it already was.
const adminOnly = requireRole('SCHOOL_ADMIN');

router.get('/role-permissions', adminOnly, controller.getPermissions);
router.put('/role-permissions', adminOnly, validateUpdatePermissions, controller.updatePermissions);

// Open to any authenticated tenant user (not just SCHOOL_ADMIN) — this is
// what the frontend's route/nav gating checks against for the caller's own
// access, not the whole-school matrix above.
router.get('/my-permissions', controller.getMyPermissions);

module.exports = router;
