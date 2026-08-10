const crypto = require('crypto');
const {
  Parent, StudentParent, Student, AcademicYear, StudentClassAssignment, Class, Level,
  Payment, CashAccount, BillPayment, User,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const reportCardsService = require('../reportCards/service');
const assessmentService = require('../assessment/service');
const financialsService = require('../financials/service');
const leviesService = require('../levies/service');
const attendanceService = require('../attendance/service');
const activitiesService = require('../activities/service');
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
      include: [{ model: Class, include: [Level] }],
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
      // Nursery/KG only — used by the frontend to show the "Daily
      // Activities" (creche) link exclusively for pre-school children, same
      // category check as activities/service.js's EARLY_YEARS_CATEGORIES.
      levelCategory: classByStudentId.get(s.id)?.Level?.category || null,
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

// Subjects the child has at least one confirmed exam score in — feeds the
// subject picker on ChildSubjectTrendPage.jsx, since a parent has no class/
// teacher-assignment context to derive one from otherwise (unlike the
// admin/teacher SubjectTrendPage, which uses fetchMyAssignments).
async function getChildSubjects(schoolId, userId, studentId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return assessmentService.getStudentSubjects(schoolId, studentId);
}

// Same trend data (and least-squares IMPROVING/DECLINING/STABLE
// classification) as the admin-facing SubjectTrendPage, just gated by
// "is this my child" instead of "do I teach this class+subject" — see
// assessment/service.js#computeStudentSubjectTrend for the shared core.
async function getChildSubjectTrend(schoolId, userId, studentId, subjectId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return assessmentService.computeStudentSubjectTrend(schoolId, { studentId, subjectId });
}

async function getAttendance(schoolId, userId, studentId, termId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return attendanceService.getStudentAttendanceReport(schoolId, studentId, termId);
}

// Daily creche log entries for this child within a term — distinct from
// getReportCard's termly activity ratings, which stay confirm/lock-based
// and only surface at term-end.
async function getDailyActivities(schoolId, userId, studentId, termId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);
  return activitiesService.getStudentDailyLog(schoolId, { studentId, termId });
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

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function requirePaystackSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new ApiError(500, 'Payment provider is not configured yet');
  return key;
}

// The single cash account a school has designated to receive parent-initiated
// online payments (CashAccountsPage.jsx's "Use for online payments" toggle).
// Not DB-enforced as a singleton — if more than one is ever flagged, the
// first found wins; callers are expected to only flag one.
async function resolveOnlineCashAccountId(schoolId) {
  const account = await tenantScoped(CashAccount, schoolId).findOne({
    where: { isOnlineDefault: true, isActive: true },
  });
  if (!account) throw new ApiError(409, 'Online payments are not configured for this school yet.');
  return account.id;
}

// Starts a parent-initiated Paystack payment for a child's full outstanding
// fee balance. Same server-redirect mechanics as billing/service.js's
// platform-subscription flow, just scoped to one student's balance instead
// of a plan price, and tracked on the same Payment model via
// purpose: 'fee_payment' (see models/payment.js).
async function initializeFeePayment(schoolId, userId, studentId) {
  await assertParentOwnsStudent(schoolId, userId, studentId);

  const balancePesewas = await financialsService.computeStudentBalancePesewas(schoolId, studentId);
  if (balancePesewas <= 0) {
    throw new ApiError(409, 'This child has no outstanding balance to pay.');
  }
  // Fail fast, before creating a Payment row or calling out to Paystack, if
  // the school hasn't configured where online payments should land.
  await resolveOnlineCashAccountId(schoolId);

  const user = await User.findByPk(userId);
  const secretKey = requirePaystackSecretKey();
  const reference = `vx_fee_${crypto.randomUUID()}`;

  const payment = await Payment.create({
    schoolId,
    purpose: 'fee_payment',
    planCode: 'fee_payment',
    amountPesewas: balancePesewas,
    currency: 'GHS',
    reference,
    status: 'pending',
    studentId,
  });

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  let response;
  let data;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: balancePesewas,
        currency: 'GHS',
        reference,
        callback_url: `${appUrl}/parent/billing/callback?studentId=${studentId}`,
        metadata: { schoolId, studentId, purpose: 'fee_payment' },
        // Parents pay online via bank transfer or mobile money only — no
        // card/USSD/QR on the hosted checkout page.
        channels: ['bank_transfer', 'mobile_money'],
      }),
    });
    data = await response.json();
  } catch (err) {
    payment.status = 'failed';
    await payment.save();
    throw new ApiError(502, 'Could not reach payment provider');
  }

  if (!response.ok || !data.status) {
    payment.status = 'failed';
    await payment.save();
    throw new ApiError(502, data.message || 'Failed to initialize payment');
  }

  return { authorizationUrl: data.data.authorization_url, reference };
}

// Idempotent — safe to call from both the parent's browser (on redirect back
// from Paystack) and the webhook, whichever lands first. Guards against
// double-recording by checking for an already-written BillPayment with this
// Paystack reference before calling financialsService.recordPayment, which
// is the exact same write path admin-recorded payments use (receipt
// numbering, GL journal posting, and SMS/email receipt notification all
// come along for free).
async function applySuccessfulFeePayment(payment) {
  if (payment.status === 'success') return payment;

  const alreadyRecorded = await tenantScoped(BillPayment, payment.schoolId).findOne({
    where: { reference: payment.reference },
  });
  if (!alreadyRecorded) {
    const cashAccountId = await resolveOnlineCashAccountId(payment.schoolId);
    await financialsService.recordPayment(payment.schoolId, payment.studentId, null, {
      amountPesewas: payment.amountPesewas,
      method: 'MOBILE_MONEY',
      paidDate: new Date(),
      reference: payment.reference,
      notes: 'Paid online via Paystack',
      cashAccountId,
    });
  }

  payment.status = 'success';
  payment.paidAt = new Date();
  await payment.save();
  return payment;
}

async function verifyFeePayment(schoolId, userId, reference) {
  const payment = await Payment.findOne({ where: { reference, schoolId, purpose: 'fee_payment' } });
  if (!payment) throw new ApiError(404, 'Payment not found');
  await assertParentOwnsStudent(schoolId, userId, payment.studentId);

  if (payment.status === 'success') {
    const balancePesewas = await financialsService.computeStudentBalancePesewas(schoolId, payment.studentId);
    return { status: payment.status, balancePesewas };
  }

  const secretKey = requirePaystackSecretKey();
  let response;
  let data;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    data = await response.json();
  } catch (err) {
    throw new ApiError(502, 'Could not reach payment provider');
  }

  if (!response.ok || !data.status) {
    throw new ApiError(502, data.message || 'Failed to verify payment');
  }

  const tx = data.data;
  const isValid = tx.status === 'success'
    && tx.amount === payment.amountPesewas
    && tx.currency === payment.currency;

  payment.rawResponse = JSON.stringify(tx);

  if (!isValid) {
    payment.status = 'failed';
    await payment.save();
    throw new ApiError(400, 'Payment could not be verified');
  }

  await payment.save();
  await applySuccessfulFeePayment(payment);
  const balancePesewas = await financialsService.computeStudentBalancePesewas(schoolId, payment.studentId);
  return { status: payment.status, balancePesewas };
}

// Called from billing/controller.js#webhook, which already dispatches every
// incoming Paystack event to multiple handlers and expects each to no-op if
// the event isn't theirs — this one only acts on 'vx_fee_'-prefixed
// references, covering the case a parent closes the tab before the
// redirect-driven verifyFeePayment above ever runs.
async function handleFeePaymentWebhookEvent(event) {
  if (event.event !== 'charge.success') return;
  const reference = event.data && event.data.reference;
  if (!reference || !reference.startsWith('vx_fee_')) return;

  const payment = await Payment.findOne({ where: { reference, purpose: 'fee_payment' } });
  if (!payment || payment.status === 'success') return;

  const isValid = event.data.status === 'success'
    && event.data.amount === payment.amountPesewas
    && event.data.currency === payment.currency;
  if (!isValid) return;

  payment.rawResponse = JSON.stringify(event.data);
  await applySuccessfulFeePayment(payment);
}

module.exports = {
  getChildren,
  getReportCard,
  getChildSubjects,
  getChildSubjectTrend,
  getStudentBills,
  getStudentLevies,
  getFinancialStatement,
  getAttendance,
  getDailyActivities,
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
  initializeFeePayment,
  verifyFeePayment,
  handleFeePaymentWebhookEvent,
};
