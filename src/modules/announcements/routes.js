const express = require('express');
const controller = require('./controller');
const { validateAnnouncement } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const manageRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

router.get('/announcements', manageRoles, controller.list);
router.post('/announcements', manageRoles, validateAnnouncement, controller.create);
router.patch('/announcements/:id', manageRoles, validateAnnouncement, controller.update);
router.delete('/announcements/:id', manageRoles, controller.remove);

module.exports = router;
