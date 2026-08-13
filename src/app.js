const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./modules/auth/routes');
const academicRoutes = require('./modules/academic/routes');
const usersRoutes = require('./modules/users/routes');
const rolePermissionsRoutes = require('./modules/rolePermissions/routes');
const rolesRoutes = require('./modules/roles/routes');
const subjectsRoutes = require('./modules/subjects/routes');
const staffRoutes = require('./modules/staff/routes');
const staffDocumentsRoutes = require('./modules/staffDocuments/routes');
const staffAppraisalsRoutes = require('./modules/staffAppraisals/routes');
const staffLeaveRoutes = require('./modules/staffLeave/routes');
const studentsRoutes = require('./modules/students/routes');
const feesRoutes = require('./modules/fees/routes');
const financialsRoutes = require('./modules/financials/routes');
const leviesRoutes = require('./modules/levies/routes');
const expensesRoutes = require('./modules/expenses/routes');
const accountingRoutes = require('./modules/accounting/routes');
const pettyCashRoutes = require('./modules/pettyCash/routes');
const payrollRoutes = require('./modules/payroll/routes');
const fixedAssetsRoutes = require('./modules/fixedAssets/routes');
const budgetingRoutes = require('./modules/budgeting/routes');
const inventoryRoutes = require('./modules/inventory/routes');
const timetableRoutes = require('./modules/timetable/routes');
const transportRoutes = require('./modules/transport/routes');
const dataImportRoutes = require('./modules/dataImport/routes');
const messagingRoutes = require('./modules/messaging/routes');
const schoolSettingsRoutes = require('./modules/schoolSettings/routes');
const schoolPaymentAccountsRoutes = require('./modules/schoolPaymentAccounts/routes');
const assignmentsRoutes = require('./modules/assignments/routes');
const dutiesRoutes = require('./modules/duties/routes');
const assessmentRoutes = require('./modules/assessment/routes');
const activitiesRoutes = require('./modules/activities/routes');
const notificationsRoutes = require('./modules/notifications/routes');
const gradingSettingsRoutes = require('./modules/gradingSettings/routes');
const gradingEngineRoutes = require('./modules/gradingEngine/routes');
const attendanceRoutes = require('./modules/attendance/routes');
const gateLogRoutes = require('./modules/gateLog/routes');
const reportCardsRoutes = require('./modules/reportCards/routes');
const reportCardsPublicRoutes = require('./modules/reportCards/publicRoutes');
const parentPortalRoutes = require('./modules/parentPortal/routes');
const announcementsRoutes = require('./modules/announcements/routes');
const announcementsPublicRoutes = require('./modules/announcements/publicRoutes');
const sermonsRoutes = require('./modules/sermons/routes');
const sermonsPublicRoutes = require('./modules/sermons/publicRoutes');
const newslettersRoutes = require('./modules/newsletters/routes');
const issuesRoutes = require('./modules/issues/routes');
const incidentsRoutes = require('./modules/incidents/routes');
const healthRoutes = require('./modules/health/routes');
const admissionsRoutes = require('./modules/admissions/routes');
const admissionsPublicRoutes = require('./modules/admissions/publicRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// More specific /api/v1/* prefixes must be registered before the bare
// /api/v1 mount below — academicRoutes applies its auth middleware to every
// path that reaches it (router.use(authenticate, ...) with no path matches
// every sub-path of its mount, not just its own declared routes), so if a
// more specific public prefix were checked after it, academicRoutes would
// shadow it and 401 the request before it ever reached its real handler.
// This bit reportCardsPublicRoutes and admissionsPublicRoutes for real
// (empirically confirmed both 401'd before this fix) — every public,
// unauthenticated /api/v1/public/* prefix must live in this block, not
// mixed in further down near its sibling authenticated router.
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/public/report-cards', reportCardsPublicRoutes);
app.use('/api/v1/public/admissions', admissionsPublicRoutes);
app.use('/api/v1/public/announcements', announcementsPublicRoutes);
app.use('/api/v1/public/sermons', sermonsPublicRoutes);
app.use('/api/v1', academicRoutes);
app.use('/api/v1', usersRoutes);
app.use('/api/v1', rolePermissionsRoutes);
app.use('/api/v1', rolesRoutes);
app.use('/api/v1', subjectsRoutes);
app.use('/api/v1', staffRoutes);
app.use('/api/v1', staffDocumentsRoutes);
app.use('/api/v1', staffAppraisalsRoutes);
app.use('/api/v1', staffLeaveRoutes);
app.use('/api/v1', studentsRoutes);
app.use('/api/v1', feesRoutes);
app.use('/api/v1', financialsRoutes);
app.use('/api/v1', leviesRoutes);
app.use('/api/v1', expensesRoutes);
app.use('/api/v1', accountingRoutes);
app.use('/api/v1', pettyCashRoutes);
app.use('/api/v1', payrollRoutes);
app.use('/api/v1', fixedAssetsRoutes);
app.use('/api/v1', budgetingRoutes);
app.use('/api/v1', inventoryRoutes);
app.use('/api/v1', timetableRoutes);
app.use('/api/v1', transportRoutes);
app.use('/api/v1', dataImportRoutes);
app.use('/api/v1', messagingRoutes);
app.use('/api/v1', schoolSettingsRoutes);
app.use('/api/v1', schoolPaymentAccountsRoutes);
app.use('/api/v1', assignmentsRoutes);
app.use('/api/v1', dutiesRoutes);
app.use('/api/v1', assessmentRoutes);
app.use('/api/v1', activitiesRoutes);
app.use('/api/v1', notificationsRoutes);
app.use('/api/v1', gradingSettingsRoutes);
app.use('/api/v1', gradingEngineRoutes);
app.use('/api/v1', attendanceRoutes);
app.use('/api/v1', gateLogRoutes);
app.use('/api/v1', reportCardsRoutes);
app.use('/api/v1', admissionsRoutes);
// announcementsRoutes must be mounted before parentPortalRoutes: the parent
// router's requireRole('PARENT') guard is registered with no path prefix
// (router.use(...), no leading path), so it runs for every request that
// reaches that router at all — not just its own declared routes — and a
// thrown 403 short-circuits past every router mounted after it. Any router
// meant for non-parent roles has to be mounted earlier in this list.
app.use('/api/v1', announcementsRoutes);
app.use('/api/v1', sermonsRoutes);
app.use('/api/v1', newslettersRoutes);
app.use('/api/v1', issuesRoutes);
app.use('/api/v1', incidentsRoutes);
app.use('/api/v1', healthRoutes);
app.use('/api/v1', parentPortalRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
