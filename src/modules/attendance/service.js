const { Op } = require('sequelize');
const {
  Staff, ClassTeacher, Class, Level, Term, AttendanceRecord, Student, School,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { resolveRoster } = require('../../utils/classRoster');
const { notifyAttendance } = require('./notify');
const { createNotification } = require('../notifications/service');

// Attendance is a class-teacher responsibility (ClassTeacher), not a
// per-subject one (SubjectTeacher, as in assessment/service.js) — a subject
// teacher who isn't also the class teacher doesn't mark the daily register,
// avoiding two teachers independently recording conflicting statuses for the
// same day. Re-checked per-request, never cached at login, same convention
// as assessment/service.js#assertScopeAccess.
async function assertClassScopeAccess(schoolId, {
  userId, roles, classId,
}) {
  if (roles.includes('SCHOOL_ADMIN') || roles.includes('HEAD_TEACHER')) return;

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  const assignment = staffMember && await tenantScoped(ClassTeacher, schoolId).findOne({
    where: { staffId: staffMember.id, classId },
  });
  if (!assignment) {
    throw new ApiError(403, 'You are not the class teacher for this class, so you cannot access or mark its register.');
  }
}

async function getMyClasses(schoolId, userId, roles) {
  if (roles.includes('SCHOOL_ADMIN') || roles.includes('HEAD_TEACHER')) {
    return { unrestricted: true, classes: [] };
  }

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  if (!staffMember) return { unrestricted: false, classes: [] };

  const assignments = await tenantScoped(ClassTeacher, schoolId).findAll({
    where: { staffId: staffMember.id },
    include: [Class],
  });

  return {
    unrestricted: false,
    classes: assignments.map((a) => ({ id: a.classId, name: a.Class.name })),
  };
}

async function getRegister(schoolId, userId, roles, { classId, termId, date }) {
  await assertClassScopeAccess(schoolId, { userId, roles, classId });

  const students = await resolveRoster(schoolId, classId, termId);
  const studentIds = students.map((s) => s.id);

  const records = studentIds.length > 0
    ? await tenantScoped(AttendanceRecord, schoolId).findAll({
      where: { classId, date, studentId: studentIds },
    })
    : [];

  const statusByStudent = {};
  for (const record of records) {
    statusByStudent[record.studentId] = record.status;
  }

  return { students, statuses: statusByStudent };
}

async function saveRegister(schoolId, userId, roles, {
  classId, termId, date, records,
}) {
  await assertClassScopeAccess(schoolId, { userId, roles, classId });

  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });

  const results = [];
  for (const { studentId, status } of records) {
    const existing = await tenantScoped(AttendanceRecord, schoolId).findOne({
      where: { studentId, date },
    });
    if (existing) {
      await existing.update({
        classId, termId, status, markedByStaffId: staffMember ? staffMember.id : null,
      });
      results.push(existing);
    } else {
      const created = await tenantScoped(AttendanceRecord, schoolId).create({
        studentId, classId, termId, date, status, markedByStaffId: staffMember ? staffMember.id : null,
      });
      results.push(created);
    }
  }

  // Best-effort — wrapped in try/catch so an SMS-provider failure never
  // fails/rolls back the register that's already saved, same shape as
  // financials/service.js#recordPayment's use of notifyPaymentReceipt.
  let notifications = {
    attempted: 0, sent: 0, failed: 0, skippedNoContact: 0,
  };
  try {
    const [school, klass, students] = await Promise.all([
      School.findByPk(schoolId),
      tenantScoped(Class, schoolId).findByPk(classId),
      tenantScoped(Student, schoolId).findAll({ where: { id: records.map((r) => r.studentId) } }),
    ]);
    const nameByStudentId = new Map(students.map((s) => [s.id, s.fullName]));
    const entries = records
      .filter((r) => nameByStudentId.has(r.studentId))
      .map((r) => ({ studentId: r.studentId, studentName: nameByStudentId.get(r.studentId), status: r.status }));

    notifications = await notifyAttendance(schoolId, {
      school, className: klass?.name, date, entries,
    });
  } catch (err) {
    notifications.error = err.message;
  }

  return { savedCount: results.length, notifications };
}

// "Total days" = the number of distinct dates the class's register was
// actually taken that term (no school-calendar/holiday model exists or is
// being built) — a deliberate interpretive choice: a day the register wasn't
// taken simply isn't counted for anyone in the class, rather than requiring
// separate calendar infrastructure.
async function getAttendanceSummary(schoolId, studentId, termId) {
  const records = await tenantScoped(AttendanceRecord, schoolId).findAll({
    where: { studentId, termId },
  });

  const present = records.filter((r) => r.status === 'PRESENT').length;
  const absent = records.filter((r) => r.status === 'ABSENT').length;

  return {
    present, absent, totalDaysRecorded: records.length,
  };
}

// Summary counts plus the day-by-day register entries — the shape the parent
// portal's attendance report page renders (stat tiles + a dated list),
// distinct from getAttendanceSummary's bare counts used by the class-teacher
// scope-checked summary endpoint.
async function getStudentAttendanceReport(schoolId, studentId, termId) {
  const records = await tenantScoped(AttendanceRecord, schoolId).findAll({
    where: { studentId, termId },
    order: [['date', 'ASC']],
  });

  const present = records.filter((r) => r.status === 'PRESENT').length;
  const absent = records.filter((r) => r.status === 'ABSENT').length;

  return {
    summary: { present, absent, totalDaysRecorded: records.length },
    records: records.map((r) => ({ date: r.date, status: r.status })),
  };
}

// HTTP-facing wrapper for getAttendanceSummary — classId is required purely
// to run the same class-teacher-or-admin scope check as the rest of this
// module before revealing a student's attendance; the summary itself is
// computed across every record for that student+term regardless of classId,
// so a mid-term class transfer doesn't silently drop earlier days.
async function getAttendanceSummaryForCaller(schoolId, userId, roles, {
  classId, studentId, termId,
}) {
  await assertClassScopeAccess(schoolId, { userId, roles, classId });
  return getAttendanceSummary(schoolId, studentId, termId);
}

// Whole-term attendance grid for a class — every recorded date × every
// roster student, for the Attendance Report page (present/absent as icons
// with a legend). Distinct from getAttendanceSummary (one student's
// totals) — this is the full class breakdown, closer in shape to the
// assessment/report-cards "class summary" endpoints.
async function getClassAttendanceReport(schoolId, userId, roles, { classId, termId }) {
  await assertClassScopeAccess(schoolId, { userId, roles, classId });

  const students = await resolveRoster(schoolId, classId, termId);
  const studentIds = students.map((s) => s.id);

  const records = studentIds.length > 0
    ? await tenantScoped(AttendanceRecord, schoolId).findAll({
      where: { classId, termId, studentId: studentIds },
      order: [['date', 'ASC']],
    })
    : [];

  const dateSet = new Set(records.map((r) => r.date));
  const dates = [...dateSet].sort();

  const statusByStudentAndDate = {};
  for (const record of records) {
    statusByStudentAndDate[record.studentId] = statusByStudentAndDate[record.studentId] || {};
    statusByStudentAndDate[record.studentId][record.date] = record.status;
  }

  const rows = students.map((student) => {
    const byDate = statusByStudentAndDate[student.id] || {};
    const counts = { PRESENT: 0, ABSENT: 0 };
    Object.values(byDate).forEach((status) => { counts[status] += 1; });
    return {
      student, statusesByDate: byDate, counts,
    };
  });

  return { dates, rows };
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function attendanceRatePercent(presentCount, totalRecords) {
  return totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;
}

function statusKey(status) {
  return status === 'PRESENT' ? 'present' : 'absent';
}

// ---- Attendance analytics ----
// Scoped to one academic year + term, same shape and rationale as
// assessment/service.js#getExamAnalytics: single query, in-memory Map
// grouping, sorted arrays out, plus a `termTrend` that looks across the
// whole academic year for context beyond the selected term. Every class by
// default; `classIds`, when given, narrows every query to just those
// classes — used both by the admin analytics page's optional class filter
// and by getMyAttendanceAnalytics to scope down to one class teacher's own
// classes, rather than two separate code paths.
async function getAttendanceAnalytics(schoolId, { academicYearId, termId, classIds }) {
  if (!academicYearId || !termId) throw new ApiError(400, 'academicYearId and termId are required');

  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const classScope = classIds?.length ? { classId: { [Op.in]: classIds } } : {};

  const records = await tenantScoped(AttendanceRecord, schoolId).findAll({
    where: { termId, ...classScope },
    include: [{ model: Class, include: [Level] }],
  });

  const classMap = new Map();
  const dateMap = new Map();
  const weekdayCounts = Array.from({ length: 7 }, () => ({
    present: 0, absent: 0, total: 0,
  }));
  const studentIds = new Set();
  let presentCount = 0;
  let absentCount = 0;

  for (const record of records) {
    studentIds.add(record.studentId);
    if (record.status === 'PRESENT') presentCount += 1;
    else absentCount += 1;

    const classKey = record.classId;
    const classEntry = classMap.get(classKey) || {
      classId: classKey,
      name: record.Class?.name || 'Unknown',
      levelName: record.Class?.Level?.name || null,
      present: 0,
      absent: 0,
      total: 0,
      studentIds: new Set(),
    };
    classEntry[statusKey(record.status)] += 1;
    classEntry.total += 1;
    classEntry.studentIds.add(record.studentId);
    classMap.set(classKey, classEntry);

    const dateEntry = dateMap.get(record.date) || {
      present: 0, absent: 0, total: 0,
    };
    dateEntry[statusKey(record.status)] += 1;
    dateEntry.total += 1;
    dateMap.set(record.date, dateEntry);

    // Date-only strings are parsed as local calendar dates, not UTC — see
    // lib/formatDate.js's identical rationale on the frontend.
    const [year, month, day] = record.date.split('-').map(Number);
    const weekday = new Date(year, month - 1, day).getDay();
    const weekdayEntry = weekdayCounts[weekday];
    weekdayEntry[statusKey(record.status)] += 1;
    weekdayEntry.total += 1;
  }

  const byClass = [...classMap.values()]
    .map((c) => ({
      classId: c.classId,
      name: c.name,
      levelName: c.levelName,
      studentCount: c.studentIds.size,
      presentCount: c.present,
      absentCount: c.absent,
      totalRecords: c.total,
      attendanceRatePercent: attendanceRatePercent(c.present, c.total),
    }))
    .sort((a, b) => b.attendanceRatePercent - a.attendanceRatePercent);

  const dailyTrend = [...dateMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, d]) => ({
      date,
      presentCount: d.present,
      absentCount: d.absent,
      totalRecords: d.total,
      attendanceRatePercent: attendanceRatePercent(d.present, d.total),
    }));

  const byWeekday = weekdayCounts.map((d, i) => ({
    weekday: WEEKDAY_NAMES[i],
    presentCount: d.present,
    absentCount: d.absent,
    totalRecords: d.total,
    attendanceRatePercent: attendanceRatePercent(d.present, d.total),
  })).filter((d) => d.totalRecords > 0);

  const yearTerms = await tenantScoped(Term, schoolId).findAll({
    where: { academicYearId },
    order: [['sequence', 'ASC']],
  });
  const yearTermRecords = await tenantScoped(AttendanceRecord, schoolId).findAll({
    where: { termId: yearTerms.map((t) => t.id), ...classScope },
    attributes: ['termId', 'status'],
  });
  const trendByTerm = new Map();
  for (const record of yearTermRecords) {
    const entry = trendByTerm.get(record.termId) || {
      present: 0, absent: 0, total: 0,
    };
    entry[statusKey(record.status)] += 1;
    entry.total += 1;
    trendByTerm.set(record.termId, entry);
  }
  const termTrend = yearTerms.map((t) => {
    const entry = trendByTerm.get(t.id) || {
      present: 0, absent: 0, total: 0,
    };
    return {
      termId: t.id,
      termName: t.name,
      totalRecords: entry.total,
      attendanceRatePercent: attendanceRatePercent(entry.present, entry.total),
    };
  });

  return {
    scope: {
      academicYearId, termId, termName: term.name, classId: classIds?.length === 1 ? classIds[0] : null,
    },
    summary: {
      totalRecords: records.length,
      distinctStudents: studentIds.size,
      distinctClasses: classMap.size,
      presentCount,
      absentCount,
      attendanceRatePercent: attendanceRatePercent(presentCount, records.length),
    },
    byClass,
    dailyTrend,
    byWeekday,
    termTrend,
  };
}

// A class teacher's own attendance analytics — same shape as
// getAttendanceAnalytics, just pre-scoped to whichever classes the caller
// is the class teacher for (via getMyClasses), for the Teacher Dashboard.
// SCHOOL_ADMIN/HEAD_TEACHER get `unrestricted: true` from getMyClasses with
// no classes list; that's a "this view isn't meant for you" signal here,
// not a request to fall back to whole-school data, since "my" analytics on
// a personal dashboard should never silently expand to everyone else's.
// An optional `classId` narrows the analytics to just that one class —
// `classes` in the response always lists every class the caller teaches
// (regardless of the filter) so the UI can keep offering the full picker.
async function getMyAttendanceAnalytics(schoolId, userId, roles, { academicYearId, termId, classId }) {
  if (!academicYearId || !termId) throw new ApiError(400, 'academicYearId and termId are required');

  const { unrestricted, classes } = await getMyClasses(schoolId, userId, roles);
  if (unrestricted || classes.length === 0) {
    return {
      scope: { academicYearId, termId }, noClasses: true, classes: [],
    };
  }

  if (classId && !classes.some((c) => c.id === classId)) {
    throw new ApiError(403, 'You are not the class teacher for this class.');
  }

  const analytics = await getAttendanceAnalytics(schoolId, {
    academicYearId, termId, classIds: classId ? [classId] : classes.map((c) => c.id),
  });
  return { ...analytics, noClasses: false, classes };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Whether a class teacher has marked *any* record for `date` for one of
// their own classes — the soft-prompt signal for the teacher-facing
// dashboard banner (decision: remind, don't lock them out of the app).
// SCHOOL_ADMIN/HEAD_TEACHER aren't class teachers, so they get an empty list
// same as getMyClasses/getMyAttendanceAnalytics — this endpoint has nothing
// to tell them.
async function getMyRegisterStatusToday(schoolId, userId, roles) {
  const { unrestricted, classes } = await getMyClasses(schoolId, userId, roles);
  if (unrestricted || classes.length === 0) return { date: todayIso(), classes: [] };

  const date = todayIso();
  const classIds = classes.map((c) => c.id);
  const records = await tenantScoped(AttendanceRecord, schoolId).findAll({
    where: { date, classId: classIds },
    attributes: ['classId'],
  });
  const markedClassIds = new Set(records.map((r) => r.classId));

  return {
    date,
    classes: classes.map((c) => ({ ...c, marked: markedClassIds.has(c.id) })),
  };
}

// One school day, every class, headteacher/admin view — one row per class
// (teacher, present count, absent count) plus a school-wide total for that
// day. A summary by class, not a per-student roster — distinct from
// getClassAttendanceReport (whole term, one class, per-student grid) and
// getAttendanceAnalytics (rates). "Marked" mirrors getMyRegisterStatusToday:
// any record for the day counts; NOT_MARKED/PARTIAL/COMPLETE further breaks
// that down against the full roster so a headteacher can see a register that
// was started but not finished, not just a binary done/not-done.
async function getDailyOverview(schoolId, { date } = {}) {
  const day = date || todayIso();

  const term = await tenantScoped(Term, schoolId).findOne({ where: { isCurrent: true } });
  if (!term) throw new ApiError(400, 'No current term is set for this school yet.');

  const classes = await tenantScoped(Class, schoolId).findAll({
    include: [Level, { model: Staff, as: 'classTeachers' }],
  });

  const classRows = [];
  const totals = {
    totalClasses: classes.length,
    classesMarked: 0,
    totalStudents: 0,
    totalPresent: 0,
    totalAbsent: 0,
  };

  for (const klass of classes) {
    // eslint-disable-next-line no-await-in-loop
    const students = await resolveRoster(schoolId, klass.id, term.id);
    const studentIds = students.map((s) => s.id);
    // eslint-disable-next-line no-await-in-loop
    const records = studentIds.length > 0
      ? await tenantScoped(AttendanceRecord, schoolId).findAll({
        where: { classId: klass.id, date: day, studentId: studentIds },
        include: [{ model: Staff, as: 'markedBy' }],
      })
      : [];

    const presentCount = records.filter((r) => r.status === 'PRESENT').length;
    const absentCount = records.filter((r) => r.status === 'ABSENT').length;
    const unmarkedCount = students.length - records.length;
    const status = records.length === 0 ? 'NOT_MARKED' : unmarkedCount > 0 ? 'PARTIAL' : 'COMPLETE';
    // Usually one name — the class teacher who saved the register — but a
    // register completed across two sessions (e.g. a stand-in finishing
    // stragglers) can carry more than one, so this is a set, not a single
    // value.
    const markedByNames = [...new Set(records.map((r) => r.markedBy?.fullName).filter(Boolean))];

    totals.totalStudents += students.length;
    totals.totalPresent += presentCount;
    totals.totalAbsent += absentCount;
    if (status !== 'NOT_MARKED') totals.classesMarked += 1;

    classRows.push({
      classId: klass.id,
      className: klass.name,
      levelId: klass.levelId,
      levelName: klass.Level?.name || null,
      classTeachers: (klass.classTeachers || []).map((s) => ({
        fullName: s.fullName, phone: s.phone,
      })),
      totalStudents: students.length,
      present: presentCount,
      absent: absentCount,
      unmarked: unmarkedCount,
      status,
      markedByNames,
    });
  }

  classRows.sort((a, b) => (
    (a.levelName || '').localeCompare(b.levelName || '') || a.className.localeCompare(b.className)
  ));

  return {
    date: day,
    termId: term.id,
    termName: term.name,
    totals: {
      ...totals,
      classesNotMarked: totals.totalClasses - totals.classesMarked,
      totalUnmarked: totals.totalStudents - totals.totalPresent - totals.totalAbsent,
      attendanceRatePercent: totals.totalStudents > 0
        ? Math.round((totals.totalPresent / totals.totalStudents) * 100) : 0,
    },
    classes: classRows,
  };
}

// One school's slice of the daily reminder sweep (see
// runDailyRegisterReminderSweep below) — every class with a ClassTeacher
// assignment whose register has no record at all yet for `date` gets its
// class teacher(s) an in-app notification. Best-effort per class teacher, so
// one bad row never blocks the rest, same shape as
// billing/reminderService.js#runSubscriptionReminderSweep's per-school loop.
async function sendRegisterReminders(schoolId, date) {
  const assignments = await tenantScoped(ClassTeacher, schoolId).findAll({
    include: [Class, Staff],
  });
  if (assignments.length === 0) return { remindedClasses: 0, remindedTeachers: 0 };

  const classIds = [...new Set(assignments.map((a) => a.classId))];
  const records = await tenantScoped(AttendanceRecord, schoolId).findAll({
    where: { date, classId: classIds },
    attributes: ['classId'],
  });
  const markedClassIds = new Set(records.map((r) => r.classId));

  const unmarked = assignments.filter((a) => !markedClassIds.has(a.classId) && a.Staff?.userId);
  const remindedClassIds = new Set();
  for (const assignment of unmarked) {
    remindedClassIds.add(assignment.classId);
    // eslint-disable-next-line no-await-in-loop
    await createNotification(schoolId, assignment.Staff.userId, {
      type: 'ATTENDANCE_REGISTER_UNMARKED',
      title: "Today's attendance register isn't marked yet",
      body: `Please mark the attendance register for ${assignment.Class?.name || 'your class'} today.`,
      linkUrl: '/admin/attendance/register',
    });
  }

  return { remindedClasses: remindedClassIds.size, remindedTeachers: unmarked.length };
}

// Runs once on school days (see jobs/scheduler.js) at a mid-morning cutoff —
// every active/trial school's unmarked classes get their class teacher(s)
// reminded. No calendar/holiday model exists (see getAttendanceSummary's
// comment above), so this leans on the cron expression's own Mon-Fri
// restriction rather than trying to know which days are actually school
// days.
async function runDailyRegisterReminderSweep() {
  const schools = await School.findAll({
    where: { status: { [Op.in]: ['trial', 'active'] } },
    attributes: ['id'],
  });

  const date = todayIso();
  const results = { schoolsProcessed: 0, remindedClasses: 0, errors: 0 };
  for (const school of schools) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { remindedClasses } = await sendRegisterReminders(school.id, date);
      results.schoolsProcessed += 1;
      results.remindedClasses += remindedClasses;
    } catch (err) {
      results.errors += 1;
    }
  }
  return results;
}

module.exports = {
  assertClassScopeAccess,
  getMyClasses,
  getRegister,
  saveRegister,
  getAttendanceSummary,
  getAttendanceSummaryForCaller,
  getStudentAttendanceReport,
  getClassAttendanceReport,
  getAttendanceAnalytics,
  getMyAttendanceAnalytics,
  getMyRegisterStatusToday,
  getDailyOverview,
  sendRegisterReminders,
  runDailyRegisterReminderSweep,
};
