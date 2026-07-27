const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./modules/auth/routes');
const platformRoutes = require('./modules/platform/routes');
const academicRoutes = require('./modules/academic/routes');
const usersRoutes = require('./modules/users/routes');
const subjectsRoutes = require('./modules/subjects/routes');
const staffRoutes = require('./modules/staff/routes');
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
const messagingRoutes = require('./modules/messaging/routes');
const schoolSettingsRoutes = require('./modules/schoolSettings/routes');
const assignmentsRoutes = require('./modules/assignments/routes');
const dutiesRoutes = require('./modules/duties/routes');
const assessmentRoutes = require('./modules/assessment/routes');
const activitiesRoutes = require('./modules/activities/routes');
const notificationsRoutes = require('./modules/notifications/routes');
const gradingSettingsRoutes = require('./modules/gradingSettings/routes');
const attendanceRoutes = require('./modules/attendance/routes');
const reportCardsRoutes = require('./modules/reportCards/routes');
const parentPortalRoutes = require('./modules/parentPortal/routes');
const announcementsRoutes = require('./modules/announcements/routes');
const newslettersRoutes = require('./modules/newsletters/routes');
const issuesRoutes = require('./modules/issues/routes');
const incidentsRoutes = require('./modules/incidents/routes');
const healthRoutes = require('./modules/health/routes');
const billingRoutes = require('./modules/billing/routes');
const billingController = require('./modules/billing/controller');
const onboardingRoutes = require('./modules/onboarding/routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());

// Paystack calls this directly (no JWT) and its signature check needs the
// exact raw request bytes, so this must be registered — with its own raw
// body parser — before the global express.json() below consumes the body.
app.post(
  '/api/v1/billing/webhook',
  express.raw({ type: 'application/json' }),
  billingController.webhook,
);

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Served cross-origin to the Vite dev server, so relax the resource policy
// helmet sets by default (helmet() above still protects the JSON API).
app.use(
  '/uploads',
  helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }),
  express.static(path.join(__dirname, '../uploads')),
);

// More specific /api/v1/* prefixes must be registered before the bare
// /api/v1 mount below — academicRoutes applies its auth middleware to every
// path that reaches it, so if it were checked first it would shadow (and
// 401) any other /api/v1/* route, including the intentionally public
// onboarding endpoint.
app.use('/api/v1/auth', authRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1', academicRoutes);
app.use('/api/v1', usersRoutes);
app.use('/api/v1', subjectsRoutes);
app.use('/api/v1', staffRoutes);
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
app.use('/api/v1', messagingRoutes);
app.use('/api/v1', schoolSettingsRoutes);
app.use('/api/v1', assignmentsRoutes);
app.use('/api/v1', dutiesRoutes);
app.use('/api/v1', assessmentRoutes);
app.use('/api/v1', activitiesRoutes);
app.use('/api/v1', notificationsRoutes);
app.use('/api/v1', gradingSettingsRoutes);
app.use('/api/v1', attendanceRoutes);
app.use('/api/v1', reportCardsRoutes);
// announcementsRoutes must be mounted before parentPortalRoutes: the parent
// router's requireRole('PARENT') guard is registered with no path prefix
// (router.use(...), no leading path), so it runs for every request that
// reaches that router at all — not just its own declared routes — and a
// thrown 403 short-circuits past every router mounted after it. Any router
// meant for non-parent roles has to be mounted earlier in this list.
app.use('/api/v1', announcementsRoutes);
app.use('/api/v1', newslettersRoutes);
app.use('/api/v1', issuesRoutes);
app.use('/api/v1', incidentsRoutes);
app.use('/api/v1', healthRoutes);
app.use('/api/v1', parentPortalRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
