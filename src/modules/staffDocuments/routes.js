const express = require('express');
const controller = require('./controller');
const { validateStaffDocument } = require('./validators');
const { uploadStaffDocument } = require('../../middleware/staffDocumentUpload');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requirePermission } = require('../../middleware/permissionGuard');

const router = express.Router();

router.use(authenticate, requireTenant);

const adminOnly = requirePermission('staff', 'MANAGE');

router.get('/staff/:staffId/documents', adminOnly, controller.listStaffDocuments);
router.post(
  '/staff/:staffId/documents',
  adminOnly,
  uploadStaffDocument,
  validateStaffDocument,
  controller.createStaffDocument,
);
router.delete('/staff/:staffId/documents/:documentId', adminOnly, controller.deleteStaffDocument);

module.exports = router;
