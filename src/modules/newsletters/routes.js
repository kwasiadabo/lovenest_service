const express = require('express');
const controller = require('./controller');
const { validateNewsletter } = require('./validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const manageRoles = requireRole('SCHOOL_ADMIN', 'HEAD_TEACHER');

router.get('/newsletters', manageRoles, controller.list);
router.post('/newsletters', manageRoles, validateNewsletter, controller.create);
router.patch('/newsletters/:id', manageRoles, validateNewsletter, controller.update);
router.delete('/newsletters/:id', manageRoles, controller.remove);

module.exports = router;
