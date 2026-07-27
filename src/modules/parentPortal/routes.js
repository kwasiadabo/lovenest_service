const express = require('express');
const controller = require('./controller');
const { validateReportCardQuery, validateIssueCreate } = require('./validators');
const { validateMessageBody } = require('../issues/validators');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantScope');
const { requireRole } = require('../../middleware/roleGuard');

const router = express.Router();

router.use(authenticate, requireTenant, requireRole('PARENT'));

router.get('/parent/children', controller.getChildren);
router.get('/parent/children/:studentId/report-cards', validateReportCardQuery, controller.getReportCard);
router.get('/parent/children/:studentId/bills', controller.getStudentBills);
router.get('/parent/children/:studentId/levies', controller.getStudentLevies);
router.get('/parent/children/:studentId/financial-statement', controller.getFinancialStatement);
router.get('/parent/children/:studentId/attendance', validateReportCardQuery, controller.getAttendance);
router.get('/parent/children/:studentId/incidents', controller.getIncidents);
router.get('/parent/children/:studentId/sick-bay-visits', controller.getSickBayVisits);
router.get('/parent/children/:studentId/medication-logs', controller.getMedicationLogs);
router.get('/parent/children/:studentId/transport', controller.getTransport);
router.get('/parent/children/:studentId/transport-history', controller.getTransportHistory);
router.get('/parent/announcements', controller.getAnnouncements);
router.get('/parent/newsletters', controller.getNewsletters);
router.get('/parent/issues', controller.listIssues);
router.post('/parent/issues', validateIssueCreate, controller.createIssue);
router.get('/parent/issues/:id', controller.getIssue);
router.post('/parent/issues/:id/messages', validateMessageBody, controller.addIssueMessage);

module.exports = router;
