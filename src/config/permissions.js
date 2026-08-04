const { ASSIGNABLE_ROLES } = require('../modules/users/validators');

// SCHOOL_ADMIN is deliberately excluded — it always has full access,
// hardcoded, so a school can never lock its own admins out. Every other
// assignable role's access is what this matrix makes editable.
const EDITABLE_ROLES = ASSIGNABLE_ROLES.filter((role) => role !== 'SCHOOL_ADMIN');

// One ordinal scale reused across every module, rather than a bespoke tier
// shape per module — see backend/src/middleware/permissionGuard.js. A role
// passes a route's check if its stored level for that module ranks at or
// above the level the route requires.
const LEVELS = ['NONE', 'VIEW', 'CONTRIBUTE', 'MANAGE'];
const LEVEL_RANK = Object.fromEntries(LEVELS.map((level, index) => [level, index]));

// Modules a SCHOOL_ADMIN can grant the other roles access to, grouped for
// the settings-page UI. Each key matches what routes.js files pass to
// requirePermission(moduleKey, level) — see that middleware and the
// requireRole -> requirePermission conversion across modules/*/routes.js.
//
// Deliberately NOT covered here (stay hardcoded to their current
// requireRole(...) check, never delegable through this matrix):
//   - Users & User Access itself (managing accounts/roles/this matrix).
//   - A handful of the single most sensitive action per finance module
//     (ledger-admin journal entries, payroll salary-structure/approval,
//     inventory/expense item-catalog setup) — each already SCHOOL_ADMIN-only
//     today, called out at its requirePermission call site.
//   - Notifications (self-scoped, no role check today) and Dashboard
//     (visible to every school-role user, nothing to gate).
const MODULES = [
  { key: 'students', label: 'Students', group: 'Students' },
  { key: 'staff', label: 'Staff', group: 'Staff' },
  { key: 'duties', label: 'Duties & Duty Roster', group: 'Staff' },
  { key: 'teacherAssignments', label: 'Teacher Assignments', group: 'Staff' },
  { key: 'academicSetup', label: 'Academic Setup', group: 'Academics' },
  { key: 'subjects', label: 'Subjects', group: 'Academics' },
  { key: 'timetable', label: 'Timetable', group: 'Academics' },
  { key: 'assessment', label: 'Assessment', group: 'Academics' },
  { key: 'activities', label: 'Pre-school Activities', group: 'Academics' },
  { key: 'attendance', label: 'Attendance', group: 'Academics' },
  { key: 'reportCards', label: 'Report Cards', group: 'Academics' },
  { key: 'dataImport', label: 'Data Import', group: 'Academics' },
  { key: 'accounting', label: 'Accounting', group: 'Finance' },
  { key: 'billing', label: 'Billing & Fee Payments', group: 'Finance' },
  { key: 'levies', label: 'Levies', group: 'Finance' },
  { key: 'feesSetup', label: 'Fees Setup', group: 'Finance' },
  { key: 'budgeting', label: 'Budgeting', group: 'Finance' },
  { key: 'fixedAssets', label: 'Fixed Assets', group: 'Finance' },
  { key: 'expenses', label: 'Expenses', group: 'Finance' },
  { key: 'inventory', label: 'Inventory', group: 'Finance' },
  { key: 'pettyCash', label: 'Petty Cash', group: 'Finance' },
  { key: 'payroll', label: 'Payroll', group: 'Finance' },
  { key: 'transportManagement', label: 'Transport Management', group: 'Transport' },
  { key: 'driverOperations', label: 'Driver Operations', group: 'Transport' },
  { key: 'health', label: 'Health', group: 'Health & Discipline' },
  { key: 'incidents', label: 'Incidents', group: 'Health & Discipline' },
  { key: 'communications', label: 'Communications', group: 'Communications' },
  { key: 'schoolSettings', label: 'School Settings', group: 'Settings' },
];
const MODULE_KEYS = MODULES.map((m) => m.key);

// Reproduces today's exact requireRole(...) behavior for every module above,
// so shipping this feature changes nothing until a SCHOOL_ADMIN actively
// edits their school's matrix. Used both as the seed for a school's first
// save and as the live fallback (see rolePermissions/service.js) whenever a
// (schoolId, role, module) row doesn't exist yet — same "resolve to a
// default, don't eagerly persist one" approach as gradingSettings'
// DEFAULT_GRADE_BANDS.
const DEFAULT_ROLE_PERMISSIONS = {
  students: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'CONTRIBUTE', TEACHER: 'VIEW', ACCOUNTANT: 'VIEW', DRIVER: 'NONE',
  },
  staff: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'NONE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  duties: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'NONE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  teacherAssignments: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'NONE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  academicSetup: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'NONE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  subjects: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'NONE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  timetable: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'CONTRIBUTE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  assessment: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'MANAGE', TEACHER: 'CONTRIBUTE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  activities: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'CONTRIBUTE', TEACHER: 'CONTRIBUTE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  attendance: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'MANAGE', TEACHER: 'CONTRIBUTE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  reportCards: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'MANAGE', TEACHER: 'CONTRIBUTE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  dataImport: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'NONE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  accounting: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'VIEW', TEACHER: 'NONE', ACCOUNTANT: 'CONTRIBUTE', DRIVER: 'NONE',
  },
  billing: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'CONTRIBUTE', TEACHER: 'NONE', ACCOUNTANT: 'MANAGE', DRIVER: 'NONE',
  },
  levies: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'CONTRIBUTE', TEACHER: 'NONE', ACCOUNTANT: 'MANAGE', DRIVER: 'NONE',
  },
  feesSetup: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'NONE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  budgeting: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'VIEW', TEACHER: 'NONE', ACCOUNTANT: 'CONTRIBUTE', DRIVER: 'NONE',
  },
  fixedAssets: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'VIEW', TEACHER: 'NONE', ACCOUNTANT: 'MANAGE', DRIVER: 'NONE',
  },
  expenses: {
    ADMINISTRATOR: 'CONTRIBUTE', HEAD_TEACHER: 'MANAGE', TEACHER: 'NONE', ACCOUNTANT: 'CONTRIBUTE', DRIVER: 'NONE',
  },
  inventory: {
    ADMINISTRATOR: 'CONTRIBUTE', HEAD_TEACHER: 'MANAGE', TEACHER: 'NONE', ACCOUNTANT: 'CONTRIBUTE', DRIVER: 'NONE',
  },
  pettyCash: {
    ADMINISTRATOR: 'CONTRIBUTE', HEAD_TEACHER: 'VIEW', TEACHER: 'NONE', ACCOUNTANT: 'CONTRIBUTE', DRIVER: 'NONE',
  },
  payroll: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'VIEW', TEACHER: 'NONE', ACCOUNTANT: 'MANAGE', DRIVER: 'NONE',
  },
  transportManagement: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'VIEW', TEACHER: 'VIEW', ACCOUNTANT: 'CONTRIBUTE', DRIVER: 'NONE',
  },
  driverOperations: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'NONE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'MANAGE',
  },
  health: {
    ADMINISTRATOR: 'MANAGE', HEAD_TEACHER: 'VIEW', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  incidents: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'CONTRIBUTE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  communications: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'MANAGE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
  schoolSettings: {
    ADMINISTRATOR: 'NONE', HEAD_TEACHER: 'NONE', TEACHER: 'NONE', ACCOUNTANT: 'NONE', DRIVER: 'NONE',
  },
};

function defaultLevelFor(role, moduleKey) {
  return (DEFAULT_ROLE_PERMISSIONS[moduleKey] || {})[role] || 'NONE';
}

module.exports = {
  EDITABLE_ROLES,
  LEVELS,
  LEVEL_RANK,
  MODULES,
  MODULE_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  defaultLevelFor,
};
