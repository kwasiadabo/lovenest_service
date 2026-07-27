const express = require('express');
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');

const router = express.Router();

// No requireRole — self-scoped by req.auth.userId, so every role (including
// PARENT) sees only their own notifications.
router.use(authenticate, requireTenant);

router.get('/notifications', controller.list);
router.post('/notifications/:id/read', controller.markRead);
router.post('/notifications/mark-all-read', controller.markAllRead);

module.exports = router;
