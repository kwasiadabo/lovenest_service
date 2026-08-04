const { Op } = require('sequelize');
const {
  sequelize,
  Levy, LevyClassAmount, LevyStudent, LevyPayment, LevyPaymentRevision, AcademicYear, Term, Class, Level,
  Student, StudentClassAssignment, School, User, CashAccount,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const assertNotSelfReversal = require('../../utils/assertNotSelfReversal');
const { notifyPaymentReceipt } = require('../financials/notify');
const { postJournalEntry, reverseEntryFor } = require('../accounting/ledgerPoster');

// Every User include in this file must be scoped to this — full User rows
// carry passwordHash/resetPasswordTokenHash, which must never reach the API
// response (same convention as financials/service.js).
const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

function displayName(user) {
  if (!user) return null;
  if (user.fullName?.trim()) return user.fullName.trim();
  if (!user.email) return null;
  return user.email.split('@')[0]
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function classInfoFrom(klass) {
  if (!klass) return null;
  return {
    classId: klass.id, className: klass.name, levelId: klass.levelId, levelName: klass.Level?.name,
  };
}

// ---- Scope / amount resolution ----
// A levy's obligation is computed live from its definition + LevyClassAmount
// rows, never materialized — see plan: editing a levy's amount or scope just
// changes what future queries compute, same as FeeAmount edits not touching
// already-confirmed bills.

async function loadClassAmounts(schoolId, levyId) {
  return tenantScoped(LevyClassAmount, schoolId).findAll({ where: { levyId } });
}

async function loadLevyStudents(schoolId, levyId) {
  return tenantScoped(LevyStudent, schoolId).findAll({ where: { levyId } });
}

// Returns undefined when the student/class isn't in scope for a
// STUDENT/CLASS-targeted levy. STUDENT is checked first and never falls
// through to the class-amount lookup — a STUDENT-targeted levy's scope is
// defined purely by LevyStudent rows, independent of classId.
function effectiveAmountFor(levy, classAmounts, levyStudents, classId, studentId) {
  if (levy.targetType === 'STUDENT') {
    const row = (levyStudents || []).find((ls) => ls.studentId === studentId);
    if (!row) return undefined;
    return row.amountPesewas != null ? row.amountPesewas : levy.amountPesewas;
  }
  const row = classAmounts.find((ca) => ca.classId === classId);
  if (levy.targetType === 'CLASS') {
    if (!row) return undefined;
    return row.amountPesewas != null ? row.amountPesewas : levy.amountPesewas;
  }
  return row && row.amountPesewas != null ? row.amountPesewas : levy.amountPesewas;
}

async function getInScopeAssignments(schoolId, levy, classAmounts, levyStudents) {
  if (levy.targetType === 'STUDENT') {
    const studentIds = (levyStudents || []).map((ls) => ls.studentId);
    if (studentIds.length === 0) return [];
    return tenantScoped(StudentClassAssignment, schoolId).findAll({
      where: { academicYearId: levy.academicYearId, studentId: studentIds },
      include: [
        { model: Student, where: { status: 'ACTIVE' } },
        { model: Class, include: [Level] },
      ],
    });
  }

  const where = { academicYearId: levy.academicYearId };
  if (levy.targetType === 'CLASS') {
    const classIds = classAmounts.map((ca) => ca.classId);
    if (classIds.length === 0) return [];
    where.classId = classIds;
  }
  return tenantScoped(StudentClassAssignment, schoolId).findAll({
    where,
    include: [
      { model: Student, where: { status: 'ACTIVE' } },
      { model: Class, include: [Level] },
    ],
  });
}

// ---- Recurring/periodic levies ----
// A levy's obligation is still computed live (never materialized), same as
// the ONE_TIME case above — a recurring levy just multiplies the resolved
// per-period base amount by however many periods have elapsed since
// startDate, and debt accumulates across missed periods rather than
// resetting (there is deliberately no per-payment period tag: payments sum
// cumulatively against the running total, exactly like ONE_TIME already
// works).

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const todayStr = () => new Date().toISOString().slice(0, 10);

// Computed once per levy (never per student) — a TERMLY levy's count
// requires a Term query, and every student on the same levy/asOfDate gets
// the same answer, so hoisting this out of any per-student loop avoids an
// N+1 query blow-up on computeCollection's per-student iteration.
async function periodsElapsed(schoolId, levy, asOfDate) {
  if (levy.frequency === 'ONE_TIME' || !levy.startDate) return 0;
  if (asOfDate < levy.startDate) return 0; // DATEONLY strings compare lexically

  if (levy.frequency === 'TERMLY') {
    const terms = await tenantScoped(Term, schoolId).findAll({
      where: { academicYearId: levy.academicYearId },
      order: [['sequence', 'ASC']],
    });
    return terms.filter((t) => t.startDate <= asOfDate).length;
  }

  const start = new Date(`${levy.startDate}T00:00:00Z`);
  const asOf = new Date(`${asOfDate}T00:00:00Z`);
  const daysElapsed = Math.floor((asOf - start) / MS_PER_DAY);

  if (levy.frequency === 'DAILY') return daysElapsed + 1;
  if (levy.frequency === 'WEEKLY') return Math.floor(daysElapsed / 7) + 1;
  if (levy.frequency === 'MONTHLY') {
    const months = (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12
      + (asOf.getUTCMonth() - start.getUTCMonth());
    return months + 1;
  }
  return 0;
}

// The one place the flat/recurring split happens — ONE_TIME passes
// baseAmount through unchanged (byte-identical to pre-recurrence behavior),
// everything else multiplies by periods elapsed.
function applyFrequency(levy, baseAmount, periods) {
  if (baseAmount === undefined) return undefined;
  return levy.frequency === 'ONE_TIME' ? baseAmount : baseAmount * periods;
}

// ONE_TIME sums every payment unconditionally, exactly as before recurring
// levies existed. Recurring levies exclude payments dated after asOfDate so
// a report for a past period can't be "fixed" by a later payment — the
// balance reflects what was actually true as of that date.
function paidPesewasAsOf(payments, levy, asOfDate) {
  const relevant = levy.frequency === 'ONE_TIME'
    ? payments
    : payments.filter((p) => p.paidDate <= asOfDate);
  return relevant.reduce((sum, p) => sum + p.amountPesewas, 0);
}

// A student's owed/paid/balance for one levy — used both by the collection
// sheet (in bulk, see computeCollection) and by the single-student payment
// flow below. asOfDate defaults to today (the "live" view); every existing
// caller omits it, so a ONE_TIME levy's output is unchanged.
async function computeStudentLevyBalance(schoolId, levy, studentId, asOfDate = todayStr()) {
  const classAmounts = await loadClassAmounts(schoolId, levy.id);
  const levyStudents = await loadLevyStudents(schoolId, levy.id);
  const assignment = await tenantScoped(StudentClassAssignment, schoolId).findOne({
    where: { academicYearId: levy.academicYearId, studentId },
    include: [{ model: Class, include: [Level] }],
  });

  const base = effectiveAmountFor(levy, classAmounts, levyStudents, assignment?.classId, studentId);
  const periods = base !== undefined ? await periodsElapsed(schoolId, levy, asOfDate) : 0;
  const owedPesewas = applyFrequency(levy, base, periods) ?? 0;

  const payments = await tenantScoped(LevyPayment, schoolId).findAll({ where: { levyId: levy.id, studentId } });
  const paidPesewas = paidPesewasAsOf(payments, levy, asOfDate);

  return {
    owedPesewas,
    paidPesewas,
    balancePesewas: owedPesewas - paidPesewas,
    classInfo: classInfoFrom(assignment?.Class),
  };
}

function statusFor(owedPesewas, paidPesewas) {
  if (paidPesewas <= 0) return 'UNPAID';
  return paidPesewas >= owedPesewas ? 'PAID' : 'PARTIAL';
}

// A parent-facing "statement": every levy the student owes (across all
// academic years, not just the current one — same all-history convention as
// financials/service.js#listBills), each with its own due date and the
// student's own payment lines against it. A levy the student is no longer
// in scope for (year rollover, class change) still appears if they paid
// something on it — same orphan-safety rule as computeCollection.
async function getStudentLevyStatement(schoolId, studentId, asOfDate = todayStr()) {
  const levies = await tenantScoped(Levy, schoolId).findAll({
    include: [AcademicYear],
    order: [['dueDate', 'DESC'], ['createdAt', 'DESC']],
  });

  const payments = await tenantScoped(LevyPayment, schoolId).findAll({
    where: { studentId },
    order: [['paidDate', 'DESC']],
  });
  const paymentsByLevyId = new Map();
  for (const payment of payments) {
    const list = paymentsByLevyId.get(payment.levyId) || [];
    list.push(payment);
    paymentsByLevyId.set(payment.levyId, list);
  }

  const statements = [];
  for (const levy of levies) {
    const levyPayments = paymentsByLevyId.get(levy.id) || [];
    const classAmounts = await loadClassAmounts(schoolId, levy.id);
    const levyStudents = await loadLevyStudents(schoolId, levy.id);
    const assignment = await tenantScoped(StudentClassAssignment, schoolId).findOne({
      where: { academicYearId: levy.academicYearId, studentId },
      include: [{ model: Class, include: [Level] }],
    });

    const base = effectiveAmountFor(levy, classAmounts, levyStudents, assignment?.classId, studentId);
    let owedPesewas = 0;
    let inScope = false;
    if (base !== undefined) {
      const periods = await periodsElapsed(schoolId, levy, asOfDate);
      owedPesewas = applyFrequency(levy, base, periods);
      inScope = true;
    }
    if (!inScope && levyPayments.length === 0) continue;

    const paidPesewas = paidPesewasAsOf(levyPayments, levy, asOfDate);

    statements.push({
      levyId: levy.id,
      name: levy.name,
      description: levy.description,
      academicYearId: levy.academicYearId,
      academicYearName: levy.AcademicYear?.name,
      startDate: levy.startDate,
      dueDate: levy.dueDate,
      levyStatus: levy.status,
      frequency: levy.frequency,
      classInfo: classInfoFrom(assignment?.Class),
      owedPesewas,
      paidPesewas,
      balancePesewas: owedPesewas - paidPesewas,
      status: statusFor(owedPesewas, paidPesewas),
      payments: levyPayments.map((p) => ({
        id: p.id,
        amountPesewas: p.amountPesewas,
        method: p.method,
        paidDate: p.paidDate,
        reference: p.reference,
        receiptNumber: p.receiptNumber,
      })),
    });
  }

  return statements;
}

// The full collection sheet: every in-scope student, plus (so a payment
// never silently disappears from the report if the levy's scope/amount is
// edited afterward) any student who has paid something on this levy even if
// they're no longer in scope — those rows show owedPesewas: 0.
async function computeCollection(schoolId, levy, asOfDate = todayStr()) {
  const classAmounts = await loadClassAmounts(schoolId, levy.id);
  const levyStudents = await loadLevyStudents(schoolId, levy.id);
  const assignments = await getInScopeAssignments(schoolId, levy, classAmounts, levyStudents);
  const payments = await tenantScoped(LevyPayment, schoolId).findAll({ where: { levyId: levy.id } });
  const relevantPayments = levy.frequency === 'ONE_TIME'
    ? payments
    : payments.filter((p) => p.paidDate <= asOfDate);
  const periods = await periodsElapsed(schoolId, levy, asOfDate); // once, shared by every row below

  const paidByStudent = new Map();
  const lastPaymentDateByStudent = new Map();
  for (const payment of relevantPayments) {
    paidByStudent.set(payment.studentId, (paidByStudent.get(payment.studentId) || 0) + payment.amountPesewas);
    const prev = lastPaymentDateByStudent.get(payment.studentId);
    if (!prev || payment.paidDate > prev) lastPaymentDateByStudent.set(payment.studentId, payment.paidDate);
  }

  const rowByStudentId = new Map();
  for (const assignment of assignments) {
    const base = effectiveAmountFor(levy, classAmounts, levyStudents, assignment.classId, assignment.studentId);
    const owedPesewas = applyFrequency(levy, base, periods) ?? 0;
    const paidPesewas = paidByStudent.get(assignment.studentId) || 0;
    rowByStudentId.set(assignment.studentId, {
      student: assignment.Student,
      classInfo: classInfoFrom(assignment.Class),
      owedPesewas,
      paidPesewas,
      balancePesewas: owedPesewas - paidPesewas,
      status: statusFor(owedPesewas, paidPesewas),
      lastPaymentDate: lastPaymentDateByStudent.get(assignment.studentId) || null,
    });
  }

  const orphanStudentIds = [...paidByStudent.keys()].filter((id) => !rowByStudentId.has(id));
  if (orphanStudentIds.length > 0) {
    const orphanStudents = await tenantScoped(Student, schoolId).findAll({ where: { id: orphanStudentIds } });
    const orphanAssignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
      where: { academicYearId: levy.academicYearId, studentId: orphanStudentIds },
      include: [{ model: Class, include: [Level] }],
    });
    const assignmentByStudentId = new Map(orphanAssignments.map((a) => [a.studentId, a]));
    for (const student of orphanStudents) {
      const paidPesewas = paidByStudent.get(student.id) || 0;
      rowByStudentId.set(student.id, {
        student,
        classInfo: classInfoFrom(assignmentByStudentId.get(student.id)?.Class),
        owedPesewas: 0,
        paidPesewas,
        balancePesewas: -paidPesewas,
        status: 'PAID',
        lastPaymentDate: lastPaymentDateByStudent.get(student.id) || null,
      });
    }
  }

  const rows = [...rowByStudentId.values()].sort((a, b) => b.balancePesewas - a.balancePesewas);

  const classMap = new Map();
  for (const row of rows) {
    const key = row.classInfo?.classId || 'none';
    const entry = classMap.get(key) || {
      classId: key, name: row.classInfo?.className || 'No class', levelName: row.classInfo?.levelName || null,
      expectedPesewas: 0, collectedPesewas: 0, outstandingPesewas: 0, studentCount: 0,
    };
    entry.expectedPesewas += row.owedPesewas;
    entry.collectedPesewas += row.paidPesewas;
    entry.outstandingPesewas += Math.max(0, row.balancePesewas);
    entry.studentCount += 1;
    classMap.set(key, entry);
  }

  const totalExpectedPesewas = rows.reduce((sum, r) => sum + r.owedPesewas, 0);
  const totalCollectedPesewas = rows.reduce((sum, r) => sum + r.paidPesewas, 0);
  const totalOutstandingPesewas = rows.reduce((sum, r) => sum + Math.max(0, r.balancePesewas), 0);

  return {
    rows,
    byClass: [...classMap.values()].sort((a, b) => b.expectedPesewas - a.expectedPesewas),
    summary: {
      studentCount: rows.length,
      paidCount: rows.filter((r) => r.status === 'PAID').length,
      partialCount: rows.filter((r) => r.status === 'PARTIAL').length,
      unpaidCount: rows.filter((r) => r.status === 'UNPAID').length,
      totalExpectedPesewas,
      totalCollectedPesewas,
      totalOutstandingPesewas,
      collectionRatePercent: totalExpectedPesewas > 0
        ? Math.round((totalCollectedPesewas / totalExpectedPesewas) * 100) : 0,
    },
  };
}

// ---- Levy CRUD ----

async function replaceClassAmounts(schoolId, levyId, classAmounts, transaction) {
  await tenantScoped(LevyClassAmount, schoolId).destroy({ where: { levyId }, transaction });
  if (classAmounts && classAmounts.length > 0) {
    await tenantScoped(LevyClassAmount, schoolId).bulkCreate(
      classAmounts.map((ca) => ({ levyId, classId: ca.classId, amountPesewas: ca.amountPesewas ?? null })),
      { transaction },
    );
  }
}

async function validateClassIds(schoolId, classAmounts) {
  if (!classAmounts || classAmounts.length === 0) return;
  const classIds = classAmounts.map((ca) => ca.classId);
  const found = await tenantScoped(Class, schoolId).findAll({ where: { id: classIds } });
  if (found.length !== new Set(classIds).size) throw new ApiError(404, 'One or more classes not found');
}

async function replaceLevyStudents(schoolId, levyId, students, transaction) {
  await tenantScoped(LevyStudent, schoolId).destroy({ where: { levyId }, transaction });
  if (students && students.length > 0) {
    await tenantScoped(LevyStudent, schoolId).bulkCreate(
      students.map((s) => ({ levyId, studentId: s.studentId, amountPesewas: s.amountPesewas ?? null })),
      { transaction },
    );
  }
}

async function validateStudentIds(schoolId, students) {
  if (!students || students.length === 0) return;
  const studentIds = students.map((s) => s.studentId);
  const found = await tenantScoped(Student, schoolId).findAll({ where: { id: studentIds } });
  if (found.length !== new Set(studentIds).size) throw new ApiError(404, 'One or more students not found');
}

async function getLevyDetail(schoolId, levyId) {
  const levy = await tenantScoped(Levy, schoolId).findByPk(levyId, {
    include: [{ model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES }],
  });
  if (!levy) throw new ApiError(404, 'Levy not found');

  const classAmounts = await tenantScoped(LevyClassAmount, schoolId).findAll({
    where: { levyId }, include: [{ model: Class, include: [Level] }],
  });
  const levyStudents = await tenantScoped(LevyStudent, schoolId).findAll({
    where: { levyId }, include: [Student],
  });

  return {
    ...levy.toJSON(),
    classAmounts: classAmounts.map((ca) => ({
      id: ca.id,
      classId: ca.classId,
      className: ca.Class?.name,
      levelName: ca.Class?.Level?.name,
      amountPesewas: ca.amountPesewas,
    })),
    levyStudents: levyStudents.map((ls) => ({
      id: ls.id,
      studentId: ls.studentId,
      studentName: ls.Student?.fullName,
      amountPesewas: ls.amountPesewas,
    })),
  };
}

async function createLevy(schoolId, userId, {
  academicYearId, name, description, targetType, amountPesewas, startDate, dueDate, frequency, classAmounts,
  students,
}) {
  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');
  await validateClassIds(schoolId, classAmounts);
  await validateStudentIds(schoolId, students);

  const levy = await sequelize.transaction(async (transaction) => {
    const created = await tenantScoped(Levy, schoolId).create({
      academicYearId,
      name,
      description: description || null,
      targetType,
      amountPesewas,
      startDate: startDate || null,
      dueDate: dueDate || null,
      frequency: frequency || 'ONE_TIME',
      createdByUserId: userId,
    }, { transaction });
    await replaceClassAmounts(schoolId, created.id, classAmounts, transaction);
    await replaceLevyStudents(schoolId, created.id, students, transaction);
    return created;
  });

  return getLevyDetail(schoolId, levy.id);
}

async function updateLevy(schoolId, levyId, {
  name, description, targetType, amountPesewas, startDate, dueDate, frequency, classAmounts, students,
}) {
  const levy = await tenantScoped(Levy, schoolId).findByPk(levyId);
  if (!levy) throw new ApiError(404, 'Levy not found');
  await validateClassIds(schoolId, classAmounts);
  await validateStudentIds(schoolId, students);

  await sequelize.transaction(async (transaction) => {
    await levy.update({
      name,
      description: description || null,
      targetType,
      amountPesewas,
      startDate: startDate || null,
      dueDate: dueDate || null,
      frequency: frequency || 'ONE_TIME',
    }, { transaction });
    await replaceClassAmounts(schoolId, levy.id, classAmounts, transaction);
    await replaceLevyStudents(schoolId, levy.id, students, transaction);
  });

  return getLevyDetail(schoolId, levy.id);
}

async function setLevyStatus(schoolId, levyId, status) {
  const levy = await tenantScoped(Levy, schoolId).findByPk(levyId);
  if (!levy) throw new ApiError(404, 'Levy not found');
  levy.status = status;
  await levy.save();
  return levy;
}

const closeLevy = (schoolId, levyId) => setLevyStatus(schoolId, levyId, 'CLOSED');
const reopenLevy = (schoolId, levyId) => setLevyStatus(schoolId, levyId, 'ACTIVE');

async function deleteLevy(schoolId, levyId) {
  const levy = await tenantScoped(Levy, schoolId).findByPk(levyId);
  if (!levy) throw new ApiError(404, 'Levy not found');

  const paymentCount = await tenantScoped(LevyPayment, schoolId).count({ where: { levyId } });
  if (paymentCount > 0) {
    throw new ApiError(400, 'This levy has recorded payments — close it instead of deleting it');
  }

  await sequelize.transaction(async (transaction) => {
    await tenantScoped(LevyClassAmount, schoolId).destroy({ where: { levyId }, transaction });
    await tenantScoped(LevyStudent, schoolId).destroy({ where: { levyId }, transaction });
    await tenantScoped(Levy, schoolId).destroy({ where: { id: levyId }, transaction });
  });
}

async function listLevies(schoolId, { academicYearId, status } = {}) {
  const where = {};
  if (academicYearId) where.academicYearId = academicYearId;
  if (status) where.status = status;

  const levies = await tenantScoped(Levy, schoolId).findAll({ where, order: [['createdAt', 'DESC']] });

  return Promise.all(levies.map(async (levy) => {
    const { summary } = await computeCollection(schoolId, levy);
    return { ...levy.toJSON(), summary };
  }));
}

async function getLevyCollection(schoolId, levyId) {
  const levy = await tenantScoped(Levy, schoolId).findByPk(levyId);
  if (!levy) throw new ApiError(404, 'Levy not found');
  const { rows, byClass, summary } = await computeCollection(schoolId, levy);
  return { levy, rows, byClass, summary };
}

// ---- Period reporting (recurring levies) ----

// The [periodStart, periodEnd] window a given asOfDate falls into, purely
// for the "payments actually made during this period" list below — a
// separate concern from the cumulative owed/paid/balance figures
// computeCollection already produces (those reflect debt accumulated since
// startDate, not just this one period).
function resolvePeriodBoundary(levy, asOfDate, term) {
  if (levy.frequency === 'TERMLY') return { periodStart: term.startDate, periodEnd: term.endDate };

  if (levy.frequency === 'DAILY' || levy.frequency === 'ONE_TIME') {
    return {
      periodStart: levy.frequency === 'ONE_TIME' ? (levy.startDate || null) : asOfDate,
      periodEnd: asOfDate,
    };
  }

  if (levy.frequency === 'WEEKLY') {
    const d = new Date(`${asOfDate}T00:00:00Z`);
    const mondayOffset = (d.getUTCDay() + 6) % 7; // 0=Sun..6=Sat -> days since Monday
    const monday = new Date(d.getTime() - mondayOffset * MS_PER_DAY);
    const sunday = new Date(monday.getTime() + 6 * MS_PER_DAY);
    return { periodStart: monday.toISOString().slice(0, 10), periodEnd: sunday.toISOString().slice(0, 10) };
  }

  // MONTHLY
  const d = new Date(`${asOfDate}T00:00:00Z`);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { periodStart: first.toISOString().slice(0, 10), periodEnd: last.toISOString().slice(0, 10) };
}

// Which Term to report on for a TERMLY levy when the caller doesn't specify
// one explicitly: the academic year's isCurrent term, else the latest term
// that's already started, else the first term (levy hasn't started yet).
async function resolveReportTerm(schoolId, levy, termId) {
  if (termId) {
    const term = await tenantScoped(Term, schoolId).findByPk(termId);
    if (!term) throw new ApiError(404, 'Term not found');
    return term;
  }
  const terms = await tenantScoped(Term, schoolId).findAll({
    where: { academicYearId: levy.academicYearId }, order: [['sequence', 'ASC']],
  });
  if (terms.length === 0) return null;
  return terms.find((t) => t.isCurrent)
    || [...terms].reverse().find((t) => t.startDate <= todayStr())
    || terms[0];
}

// A single period's collection sheet: the same owed/paid/balance/status
// rows computeCollection already produces (as of the resolved period's end
// date — reflecting accumulated debt, per the "debt accumulates" design),
// plus a defaulters shortlist and the payments actually dated within that
// specific period's window. Works for any targetType/frequency, not just
// canteen levies specifically.
async function getLevyPeriodReport(schoolId, levyId, { asOfDate, termId } = {}) {
  const levy = await tenantScoped(Levy, schoolId).findByPk(levyId);
  if (!levy) throw new ApiError(404, 'Levy not found');

  let term = null;
  let resolvedAsOfDate = asOfDate || todayStr();
  if (levy.frequency === 'TERMLY') {
    term = await resolveReportTerm(schoolId, levy, termId);
    if (!term) throw new ApiError(400, "No terms exist for this levy's academic year");
    resolvedAsOfDate = term.endDate;
  }

  const { rows, byClass, summary } = await computeCollection(schoolId, levy, resolvedAsOfDate);
  const { periodStart, periodEnd } = resolvePeriodBoundary(levy, resolvedAsOfDate, term);

  const periodPayments = await tenantScoped(LevyPayment, schoolId).findAll({
    where: periodStart
      ? { levyId, paidDate: { [Op.between]: [periodStart, periodEnd] } }
      : { levyId, paidDate: { [Op.lte]: periodEnd } },
    include: [Student],
    order: [['paidDate', 'DESC']],
  });

  return {
    levy,
    asOfDate: resolvedAsOfDate,
    periodStart,
    periodEnd,
    term: term ? { id: term.id, name: term.name } : null,
    rows,
    byClass,
    summary,
    defaulters: rows.filter((r) => r.balancePesewas > 0),
    payments: periodPayments,
  };
}

// ---- Payments ----

// Same find-max-existing-suffix + retry-once-on-collision approach as
// financials/service.js's generateReceiptNumber, scoped to LevyPayment with
// its own "LVY-" prefix/sequence.
async function generateLevyReceiptNumber(schoolId) {
  const rows = await tenantScoped(LevyPayment, schoolId).findAll({ attributes: ['receiptNumber'] });
  const maxNumber = rows.reduce((max, row) => {
    const match = /^LVY-(\d+)$/.exec(row.receiptNumber);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `LVY-${String(maxNumber + 1).padStart(6, '0')}`;
}

async function createLevyPaymentWithReceipt(schoolId, values, transaction) {
  try {
    const receiptNumber = await generateLevyReceiptNumber(schoolId);
    return await tenantScoped(LevyPayment, schoolId).create({ ...values, receiptNumber }, { transaction });
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    const receiptNumber = await generateLevyReceiptNumber(schoolId);
    return tenantScoped(LevyPayment, schoolId).create({ ...values, receiptNumber }, { transaction });
  }
}

// Cash-basis, straight to income — a levy has no confirm/invoice step (its
// obligation is computed live, never materialized), so there's no AR leg
// the way a Bill has one.
async function postLevyPayment(schoolId, payment, levy, userId, transaction) {
  const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(payment.cashAccountId, { transaction });
  if (!cashAccount) throw new ApiError(400, 'cashAccountId does not refer to a valid cash account');

  await postJournalEntry(schoolId, {
    entryDate: payment.paidDate,
    description: `${levy.name} payment received (receipt ${payment.receiptNumber})`,
    sourceType: 'LEVY_PAYMENT',
    sourceId: payment.id,
    userId,
    lines: [
      { accountId: cashAccount.accountId, debitPesewas: payment.amountPesewas, studentId: payment.studentId },
      { accountCode: '4050', creditPesewas: payment.amountPesewas, studentId: payment.studentId },
    ],
  }, transaction);
}

async function recordLevyPayment(schoolId, levyId, studentId, userId, {
  amountPesewas, method, paidDate, reference, notes, cashAccountId,
}) {
  const levy = await tenantScoped(Levy, schoolId).findByPk(levyId);
  if (!levy) throw new ApiError(404, 'Levy not found');
  if (levy.status !== 'ACTIVE') throw new ApiError(400, 'This levy is closed to new payments');

  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const payment = await sequelize.transaction(async (transaction) => {
    const created = await createLevyPaymentWithReceipt(schoolId, {
      levyId,
      studentId,
      amountPesewas,
      method,
      paidDate,
      reference: reference || null,
      notes: notes || null,
      recordedByUserId: userId,
      cashAccountId,
    }, transaction);
    await postLevyPayment(schoolId, created, levy, userId, transaction);
    return created;
  });

  const { balancePesewas, classInfo } = await computeStudentLevyBalance(schoolId, levy, studentId);
  const classLabel = classInfo ? [classInfo.className, classInfo.levelName].filter(Boolean).join(' — ') : null;

  let notifications = { sms: { attempted: 0, sent: 0, failed: 0 }, email: { attempted: 0, sent: 0, failed: 0 } };
  try {
    const [school, issuer] = await Promise.all([
      School.findByPk(schoolId),
      userId ? User.findByPk(userId) : null,
    ]);
    notifications = await notifyPaymentReceipt(schoolId, {
      school,
      student: { ...student.toJSON(), classLabel },
      payment,
      balancePesewas,
      issuedByName: displayName(issuer),
      description: `${levy.name} payment`,
    });
  } catch (err) {
    notifications.error = err.message;
  }

  return { payment, balancePesewas, notifications };
}

// Records the same-period payment for several students in one request (a
// canteen queue/roll-call workflow) — one journal entry per student, same
// as recordLevyPayment above, but all in a single transaction so a mid-batch
// failure never leaves a partial, unbalanced set of postings. Every
// studentId's scope/base amount is resolved and validated up front, before
// the transaction opens, so an out-of-scope student hard-fails the whole
// batch rather than silently skipping them.
async function bulkRecordLevyPayments(schoolId, levyId, userId, {
  paidDate, method, cashAccountId, records,
}) {
  const levy = await tenantScoped(Levy, schoolId).findByPk(levyId);
  if (!levy) throw new ApiError(404, 'Levy not found');
  if (levy.status !== 'ACTIVE') throw new ApiError(400, 'This levy is closed to new payments');

  const classAmounts = await loadClassAmounts(schoolId, levy.id);
  const levyStudents = await loadLevyStudents(schoolId, levy.id);
  const studentIds = records.map((r) => r.studentId);

  const students = await tenantScoped(Student, schoolId).findAll({ where: { id: studentIds } });
  if (students.length !== new Set(studentIds).size) throw new ApiError(404, 'One or more students not found');
  const studentById = new Map(students.map((s) => [s.id, s]));

  const assignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
    where: { academicYearId: levy.academicYearId, studentId: studentIds },
    include: [{ model: Class, include: [Level] }],
  });
  const assignmentByStudentId = new Map(assignments.map((a) => [a.studentId, a]));

  const baseByStudentId = new Map();
  for (const r of records) {
    const assignment = assignmentByStudentId.get(r.studentId);
    const base = effectiveAmountFor(levy, classAmounts, levyStudents, assignment?.classId, r.studentId);
    if (base === undefined) throw new ApiError(400, `Student ${r.studentId} is not in scope for this levy`);
    baseByStudentId.set(r.studentId, base);
  }

  const payments = await sequelize.transaction(async (transaction) => {
    const created = [];
    for (const r of records) {
      // One period's rate when the caller doesn't specify an amount — a
      // canteen worker is charging "today's fee," not asking the student to
      // clear their whole accumulated balance in one payment.
      const perPeriodAmount = r.amountPesewas != null
        ? Number(r.amountPesewas)
        : applyFrequency(levy, baseByStudentId.get(r.studentId), 1);

      // eslint-disable-next-line no-await-in-loop
      const payment = await createLevyPaymentWithReceipt(schoolId, {
        levyId,
        studentId: r.studentId,
        amountPesewas: perPeriodAmount,
        method,
        paidDate,
        reference: r.reference || null,
        notes: r.notes || null,
        recordedByUserId: userId,
        cashAccountId,
      }, transaction);
      // eslint-disable-next-line no-await-in-loop
      await postLevyPayment(schoolId, payment, levy, userId, transaction);
      created.push(payment);
    }
    return created;
  });

  // Best-effort per-student receipts, isolated from the transaction (already
  // committed above) and from each other — one student's failed SMS/email
  // must never affect another's or roll back the batch. school/issuer are
  // fetched once, not per student.
  const [school, issuer] = await Promise.all([
    School.findByPk(schoolId),
    userId ? User.findByPk(userId) : null,
  ]);
  const notificationOutcomes = await Promise.allSettled(payments.map(async (payment) => {
    const { balancePesewas, classInfo } = await computeStudentLevyBalance(schoolId, levy, payment.studentId);
    const classLabel = classInfo ? [classInfo.className, classInfo.levelName].filter(Boolean).join(' — ') : null;
    return notifyPaymentReceipt(schoolId, {
      school,
      student: { ...studentById.get(payment.studentId).toJSON(), classLabel },
      payment,
      balancePesewas,
      issuedByName: displayName(issuer),
      description: `${levy.name} payment`,
    });
  }));

  return {
    payments,
    count: payments.length,
    notificationFailures: notificationOutcomes.filter((o) => o.status === 'rejected').length,
  };
}

async function updateLevyPayment(schoolId, levyPaymentId, userId, {
  amountPesewas, method, paidDate, reference, notes, reason, cashAccountId,
}) {
  await sequelize.transaction(async (transaction) => {
    const payment = await tenantScoped(LevyPayment, schoolId).findByPk(levyPaymentId, { transaction });
    if (!payment) throw new ApiError(404, 'Payment not found');

    const levy = await tenantScoped(Levy, schoolId).findByPk(payment.levyId, { transaction });
    if (!levy) throw new ApiError(404, 'Levy not found');

    const previousValues = {
      amountPesewas: payment.amountPesewas,
      method: payment.method,
      paidDate: payment.paidDate,
      reference: payment.reference,
      notes: payment.notes,
    };

    await reverseEntryFor(schoolId, 'LEVY_PAYMENT', payment.id, { userId, reason }, transaction);

    payment.amountPesewas = amountPesewas;
    payment.method = method;
    payment.paidDate = paidDate;
    payment.reference = reference || null;
    payment.notes = notes || null;
    payment.cashAccountId = cashAccountId;
    payment.lastEditedByUserId = userId;
    await payment.save({ transaction });

    await postLevyPayment(schoolId, payment, levy, userId, transaction);

    await tenantScoped(LevyPaymentRevision, schoolId).create({
      levyPaymentId: payment.id,
      changedByUserId: userId,
      reason,
      previousValues: JSON.stringify(previousValues),
      newValues: JSON.stringify({
        amountPesewas, method, paidDate, reference: reference || null, notes: notes || null,
      }),
    }, { transaction });
  });

  const payment = await tenantScoped(LevyPayment, schoolId).findByPk(levyPaymentId);
  const levy = await tenantScoped(Levy, schoolId).findByPk(payment.levyId);
  const student = await tenantScoped(Student, schoolId).findByPk(payment.studentId);
  const { balancePesewas, classInfo } = await computeStudentLevyBalance(schoolId, levy, payment.studentId);
  const classLabel = classInfo ? [classInfo.className, classInfo.levelName].filter(Boolean).join(' — ') : null;

  let notifications = { sms: { attempted: 0, sent: 0, failed: 0 }, email: { attempted: 0, sent: 0, failed: 0 } };
  try {
    const [school, editor] = await Promise.all([
      School.findByPk(schoolId),
      User.findByPk(userId),
    ]);
    notifications = await notifyPaymentReceipt(schoolId, {
      school,
      student: { ...student.toJSON(), classLabel },
      payment,
      balancePesewas,
      issuedByName: displayName(editor),
      description: `${levy.name} payment`,
    });
  } catch (err) {
    notifications.error = err.message;
  }

  return { payment, balancePesewas, notifications };
}

async function deleteLevyPayment(schoolId, levyPaymentId, userId) {
  return sequelize.transaction(async (transaction) => {
    const payment = await tenantScoped(LevyPayment, schoolId).findByPk(levyPaymentId, { transaction });
    if (!payment) throw new ApiError(404, 'Payment not found');
    assertNotSelfReversal(payment.recordedByUserId, userId);

    await reverseEntryFor(schoolId, 'LEVY_PAYMENT', payment.id, { userId, reason: 'Payment deleted' }, transaction);
    await payment.destroy({ transaction });
  });
}

async function getLevyPaymentReceiptData(schoolId, levyPaymentId) {
  const payment = await tenantScoped(LevyPayment, schoolId).findByPk(levyPaymentId, {
    include: [
      { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'lastEditedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
  });
  if (!payment) throw new ApiError(404, 'Payment not found');

  const levy = await tenantScoped(Levy, schoolId).findByPk(payment.levyId);
  const student = await tenantScoped(Student, schoolId).findByPk(payment.studentId);
  const school = await School.findByPk(schoolId);
  const { balancePesewas, classInfo } = await computeStudentLevyBalance(schoolId, levy, payment.studentId);
  const classLabel = classInfo ? [classInfo.className, classInfo.levelName].filter(Boolean).join(' — ') : null;

  const issuer = payment.lastEditedBy || payment.recordedBy;

  return {
    school,
    student: { ...student.toJSON(), classLabel },
    payment,
    balancePesewas,
    issuedByName: displayName(issuer),
    description: `${levy.name} payment`,
  };
}

async function listLevyPayments(schoolId, {
  levyId, from, to, classId,
} = {}) {
  const where = {};
  if (levyId) where.levyId = levyId;
  if (from && to) where.paidDate = { [Op.between]: [from, to] };
  else if (from) where.paidDate = { [Op.gte]: from };
  else if (to) where.paidDate = { [Op.lte]: to };

  let payments = await tenantScoped(LevyPayment, schoolId).findAll({
    where,
    include: [
      Student,
      Levy,
      { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'lastEditedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
    order: [['paidDate', 'DESC'], ['createdAt', 'DESC']],
  });

  // Each payment is matched against the paying student's class assignment
  // for ITS OWN levy's academic year (not "current year") — a levy can be
  // collecting against a past year's graduating batch after year rollover.
  const yearGroups = new Map();
  for (const payment of payments) {
    const yearId = payment.Levy?.academicYearId;
    if (!yearId) continue;
    const set = yearGroups.get(yearId) || new Set();
    set.add(payment.studentId);
    yearGroups.set(yearId, set);
  }
  const assignmentByYearAndStudent = new Map();
  for (const [yearId, studentIds] of yearGroups) {
    const assignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
      where: { academicYearId: yearId, studentId: [...studentIds] },
      include: [{ model: Class, include: [Level] }],
    });
    for (const assignment of assignments) {
      assignmentByYearAndStudent.set(`${yearId}:${assignment.studentId}`, assignment);
    }
  }

  payments = payments.map((p) => {
    const assignment = assignmentByYearAndStudent.get(`${p.Levy?.academicYearId}:${p.studentId}`);
    return { ...p.toJSON(), classInfo: classInfoFrom(assignment?.Class) };
  });

  if (classId) payments = payments.filter((p) => p.classInfo?.classId === classId);

  const paymentIds = payments.map((p) => p.id);
  const revisionCounts = paymentIds.length > 0
    ? await tenantScoped(LevyPaymentRevision, schoolId).findAll({
      where: { levyPaymentId: paymentIds },
      attributes: ['levyPaymentId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['levyPaymentId'],
    })
    : [];
  const countByPaymentId = new Map(revisionCounts.map((r) => [r.levyPaymentId, Number(r.get('count'))]));

  const totalPesewas = payments.reduce((sum, p) => sum + p.amountPesewas, 0);

  return {
    payments: payments.map((p) => ({ ...p, revisionCount: countByPaymentId.get(p.id) || 0 })),
    totalPesewas,
  };
}

async function getLevyPaymentRevisions(schoolId, levyPaymentId) {
  const payment = await tenantScoped(LevyPayment, schoolId).findByPk(levyPaymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');

  const revisions = await tenantScoped(LevyPaymentRevision, schoolId).findAll({
    where: { levyPaymentId },
    include: [{ model: User, as: 'changedBy', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'DESC']],
  });

  return revisions.map((r) => ({
    id: r.id,
    reason: r.reason,
    changedAt: r.createdAt,
    changedByName: r.changedBy?.fullName || r.changedBy?.email,
    previousValues: JSON.parse(r.previousValues),
    newValues: JSON.parse(r.newValues),
  }));
}

module.exports = {
  createLevy,
  updateLevy,
  closeLevy,
  reopenLevy,
  deleteLevy,
  listLevies,
  getLevyDetail,
  getLevyCollection,
  getLevyPeriodReport,
  computeStudentLevyBalance,
  getStudentLevyStatement,
  recordLevyPayment,
  bulkRecordLevyPayments,
  updateLevyPayment,
  deleteLevyPayment,
  getLevyPaymentReceiptData,
  listLevyPayments,
  getLevyPaymentRevisions,
  // Internal period-math helpers — exported only for
  // tests/unit/levies.periodMath.test.js, not meant to be used outside this
  // module otherwise.
  periodsElapsed,
  applyFrequency,
  paidPesewasAsOf,
  resolvePeriodBoundary,
};
