const {
  Parent, StudentParent, Student, AcademicYear, StudentClassAssignment, Class,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const reportCardsService = require('../reportCards/service');
const financialsService = require('../financials/service');
const leviesService = require('../levies/service');
const attendanceService = require('../attendance/service');
const announcementsService = require('../announcements/service');
const newslettersService = require('../newsletters/service');
const issuesService = require('../issues/service');
const incidentsService = require('../incidents/service');
const healthService = require('../health/service');
const transportService = require('../transport/service');

async function getParentForUser(schoolId, userId) {
  const parent = await tenantScoped(Parent, schoolId).findOne({ where: { userId } });
  if (!parent) throw new ApiError(403, 'No parent record is linked to this account.');
  return parent;
}

// Re-checked on every single parent-portal request, never cached at login —
// same "never trust the JWT alone for fine-grained scope" convention as
// assessment/service.js#assertScopeAccess and attendance's class-teacher
// check.
async function assertParentOwnsStudent(schoolId, userId, studentId) {
  const parent = await getParentForUser(schoolId, userId);
  const link = await tenantScoped(StudentParent, schoolId).findOne({
    where: { parentId: parent.id, studentId },
  });
  if (!link) throw new ApiError(403, 'You are not linked to this student.');
}

async function getChildren(schoolId, userId) {
  const parent = await getParentForUser(schoolId, userId);

  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { parentId: parent.id },
    include: [Student],
  });
  const students = links.map((l) => l.Student).filter(Boolean);
  if (students.length === 0) return [];

  const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  const assignments = currentYear
    ? await tenantScoped(StudentClassAssignment, schoolId).findAll({
      where: { academicYearId: currentYear.id, studentId: students.map((s) => s.id) },
      include: [Class],
    })
    : [];
  const classByStudentId = new Map(assignments.map((a) => [a.studentId, a.Class]));

  const ledgers = await Promise.all(
    students.map((s) => financialsService.getStudentLedger(schoolId, s.id)),
  );
  const ledgerByStudentId = new Map(students.map((s, i) => [s.id, ledgers[i]]));

  return students.map((s) => {
    const ledger = ledgerByStudentId.get(s.id);
    const lastPayment = ledger?.payments?.[0] || null;
    return {
      id: s.id,
      fullName: s.fullName,
      studentNumber: s.studentNumber,
      photoUrl: s.photoUrl,
      gender: s.gender,
      dateOfBirth: s.dateOfBirth,
      admissionDate: s.admissionDate,
      status: s.status,
      className: classByStudentId.get(s.id)?.name || null,
      balancePesewas: ledger?.balancePesewas ?? 0,
      lastPaymentDate: lastPayment?.paidDate || null,
      lastPaymentAmountPesewas: lastPayment?.amountPesewas ?? null,
    };
  });
}

async function getReportCard(schoolId, userId, studentId, termId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return reportCardsService.getPublishedReportCard(schoolId, studentId, termId);
}

// The itemized bills a school has posted for the student — as distinct from
// getFinancialStatement's dated ledger view (bills + payments + running
// balance). Provisional (not-yet-confirmed) bills are draft/internal and
// intentionally excluded here.
async function getStudentBills(schoolId, userId, studentId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return financialsService.listBills(schoolId, { studentId, status: 'CONFIRMED' });
}

// Every levy the student owes plus their own payment lines against each —
// see levies/service.js#getStudentLevyStatement for the due-date/scope
// resolution.
async function getStudentLevies(schoolId, userId, studentId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return leviesService.getStudentLevyStatement(schoolId, studentId);
}

async function getFinancialStatement(schoolId, userId, studentId, { from, to } = {}) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return financialsService.getStudentFinancialStatement(schoolId, studentId, { from, to });
}

async function getAttendance(schoolId, userId, studentId, termId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return attendanceService.getStudentAttendanceReport(schoolId, studentId, termId);
}

async function getAnnouncements(schoolId) {
  return announcementsService.listPublished(schoolId);
}

async function getNewsletters(schoolId) {
  return newslettersService.listPublished(schoolId);
}

// Incidents/disciplinary actions and health records are otherwise
// admin/head-teacher/administrator-only (see incidents/service.js,
// health/service.js) — a parent only ever sees their own linked child's
// records, re-checked on every request via assertParentOwnsStudent, same as
// every other per-child endpoint in this file.
async function getIncidents(schoolId, userId, studentId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return incidentsService.listIncidents(schoolId, { studentId, subjectType: 'STUDENT' });
}

async function getSickBayVisits(schoolId, userId, studentId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return healthService.listSickBayVisits(schoolId, { studentId });
}

async function getMedicationLogs(schoolId, userId, studentId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return healthService.listMedicationLogs(schoolId, { studentId });
}

// Vehicle/pickup point, today's pickup check-in, and transport-fee balance
// for this one child — see transport/service.js#getStudentTransportSummary.
async function getTransport(schoolId, userId, studentId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return transportService.getStudentTransportSummary(schoolId, studentId);
}

// Full pickup/drop-off history for this one child, date-range filtered —
// unlike getTransport above (today's snapshot + last-10 recent pickups),
// this is the complete record a parent can review over time. Reuses the
// same admin-report queries (transport/service.js#getStudentPickupHistory/
// getStudentDropoffHistory) — the parent-ownership check is what scopes it
// down to just this child, same as every other endpoint in this file.
async function getTransportHistory(schoolId, userId, studentId, { from, to } = {}) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  const [pickups, dropoffs] = await Promise.all([
    transportService.getStudentPickupHistory(schoolId, studentId, { from, to }),
    transportService.getStudentDropoffHistory(schoolId, studentId, { from, to }),
  ]);
  return { pickups, dropoffs };
}

// Polled every ~15s by the parent-facing map (see transport/service.js#
// getLiveTransport) while a trip is active — ownership check first, same as
// every other per-child endpoint in this file.
async function getLiveTransport(schoolId, userId, studentId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return transportService.getLiveTransport(schoolId, studentId);
}

async function createIssue(schoolId, userId, { studentId, subject, body }) {
  return issuesService.createIssue(schoolId, userId, { studentId, subject, body });
}

async function listIssues(schoolId, userId) {
  return issuesService.listIssuesForParent(schoolId, userId);
}

async function getIssue(schoolId, userId, issueId) {
  return issuesService.getIssueForParent(schoolId, userId, issueId);
}

async function addIssueMessage(schoolId, userId, issueId, body) {
  return issuesService.addParentMessage(schoolId, userId, issueId, body);
}

module.exports = {
  getChildren,
  getReportCard,
  getStudentBills,
  getStudentLevies,
  getFinancialStatement,
  getAttendance,
  getAnnouncements,
  getNewsletters,
  createIssue,
  listIssues,
  getIssue,
  addIssueMessage,
  getIncidents,
  getSickBayVisits,
  getMedicationLogs,
  getTransport,
  getTransportHistory,
  getLiveTransport,
};
