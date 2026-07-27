const {
  Student, Term, Subject, SubjectTeacher, Staff, ExamScore, ReportCard, StudentClassAssignment, Class, Level,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { resolveRoster } = require('../../utils/classRoster');
const { resolveGradingConfig } = require('../gradingSettings/service');
const { assertClassScopeAccess } = require('../attendance/service');
const attendanceService = require('../attendance/service');
const activitiesService = require('../activities/service');
const notificationsService = require('../notifications/service');

// Report cards are a class-teacher/admin action, same restriction as the
// daily register — reused rather than duplicated since the check is
// identical (ClassTeacher-based, not SubjectTeacher-based).
const assertClassTeacherOrAdmin = assertClassScopeAccess;

// A student's class for a given term is resolved via their
// StudentClassAssignment for that term's academic year (assignments are
// per-year, not per-term) — same pattern used throughout assessment/
// attendance. Also returns academicYearId/classId, needed to create a
// ReportCard row.
async function resolveStudentClassForTerm(schoolId, studentId, termId) {
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const assignment = await tenantScoped(StudentClassAssignment, schoolId).findOne({
    where: { studentId, academicYearId: term.academicYearId },
  });
  if (!assignment) throw new ApiError(404, 'This student is not assigned to a class for this term.');

  return {
    student, classId: assignment.classId, termId, academicYearId: term.academicYearId,
  };
}

// Nursery/KG are assessed on developmental activities (activities/service.js)
// rather than Subjects/ExamScore — this is the switch buildReportCardPayload
// branches on, driven by Level.category (already fixed per-school reference
// data, see models/level.js).
async function resolveClassLevel(schoolId, classId) {
  const klass = await tenantScoped(Class, schoolId).findByPk(classId, { include: [Level] });
  if (!klass) throw new ApiError(404, 'Class not found');
  return klass.Level;
}

function isEarlyYearsCategory(category) {
  return category === 'NURSERY' || category === 'KG';
}

// Highest grade band whose minScore doesn't exceed totalScore — bands are
// validated contiguous 0-100 (gradingSettings/service.js#validateBands), so
// this correctly buckets a decimal totalScore even though bands are stored
// as integer ranges (e.g. 39.5 falls in the 0-39 band, since the next band's
// minScore of 40 isn't reached).
function resolveGrade(totalScore, gradeBands) {
  const sorted = [...gradeBands].sort((a, b) => a.minScore - b.minScore);
  let matched = null;
  for (const band of sorted) {
    if (totalScore >= band.minScore) matched = band;
    else break;
  }
  return matched ? { grade: matched.grade, remark: matched.remark } : { grade: null, remark: null };
}

function computeSubjectRow(subject, examScoreRow, gradingConfig) {
  if (!examScoreRow || examScoreRow.status !== 'CONFIRMED') {
    // Not yet confirmed (or never entered) — flagged as pending rather than
    // shown as blank/stale, so a report card never silently omits or
    // misrepresents a subject that's still being marked.
    return {
      subjectId: subject.id, subjectName: subject.name, pending: true, caScaled: null, examScaled: null, totalScore: null, grade: null, remark: null,
    };
  }
  const totalScore = Number(examScoreRow.totalScore);
  const { grade, remark } = resolveGrade(totalScore, gradingConfig.gradeBands);
  return {
    subjectId: subject.id,
    subjectName: subject.name,
    pending: false,
    caScaled: Number(examScoreRow.caScaled),
    examScaled: Number(examScoreRow.examScaled),
    totalScore,
    grade,
    remark,
  };
}

// Union of subjects currently assigned to the class (SubjectTeacher — so a
// subject with no marks entered yet still shows up as pending, flagging a
// missing entry) and subjects with an actual ExamScore for this class+term
// (so a subject whose teacher assignment was later changed/removed doesn't
// silently drop already-recorded marks off the report card — confirmed
// against real data where ExamScore rows existed with zero matching
// SubjectTeacher rows after a reassignment).
async function getClassSubjects(schoolId, classId, termId) {
  const [subjectTeachers, examRows] = await Promise.all([
    tenantScoped(SubjectTeacher, schoolId).findAll({ where: { classId }, include: [Subject] }),
    tenantScoped(ExamScore, schoolId).findAll({ where: { classId, termId }, include: [Subject] }),
  ]);

  const bySubjectId = new Map();
  subjectTeachers.forEach((st) => {
    if (!bySubjectId.has(st.subjectId)) bySubjectId.set(st.subjectId, st.Subject);
  });
  examRows.forEach((row) => {
    if (!bySubjectId.has(row.subjectId) && row.Subject) bySubjectId.set(row.subjectId, row.Subject);
  });
  return [...bySubjectId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Sums each roster student's CONFIRMED-only ExamScore.totalScore across every
// subject for the class+term, then competition-ranks (ties share a position,
// e.g. 1, 1, 3) — same tie-handling as MarkSheetReportPage's rankStudents,
// moved server-side since this spans every subject, not one. A student with
// no confirmed scores at all is listed after the ranked ones, unranked.
async function getClassRanking(schoolId, classId, termId) {
  const roster = await resolveRoster(schoolId, classId, termId);
  const studentIds = roster.map((s) => s.id);

  const examRows = studentIds.length > 0
    ? await tenantScoped(ExamScore, schoolId).findAll({
      where: {
        classId, termId, studentId: studentIds, status: 'CONFIRMED',
      },
    })
    : [];

  const totalsByStudent = new Map();
  examRows.forEach((row) => {
    const prev = totalsByStudent.get(row.studentId) || 0;
    totalsByStudent.set(row.studentId, prev + Number(row.totalScore));
  });

  const withTotals = roster.map((s) => ({ ...s, aggregate: totalsByStudent.has(s.id) ? totalsByStudent.get(s.id) : null }));
  const scored = withTotals.filter((s) => s.aggregate !== null).sort((a, b) => b.aggregate - a.aggregate);
  const unscored = withTotals.filter((s) => s.aggregate === null);

  let position = 0;
  let previousAggregate = null;
  const positionByStudent = new Map();
  scored.forEach((s, index) => {
    if (s.aggregate !== previousAggregate) {
      position = index + 1;
      previousAggregate = s.aggregate;
    }
    positionByStudent.set(s.id, position);
  });
  unscored.forEach((s) => positionByStudent.set(s.id, null));

  return {
    classSize: roster.length,
    positions: positionByStudent,
    aggregates: totalsByStudent,
  };
}

async function getOrDefaultRemarks(schoolId, studentId, termId) {
  const row = await tenantScoped(ReportCard, schoolId).findOne({ where: { studentId, termId } });
  if (row) {
    return {
      conduct: row.conduct,
      interest: row.interest,
      classTeacherRemark: row.classTeacherRemark,
      headteacherRemark: row.headteacherRemark,
      promotionStatus: row.promotionStatus,
      promotedToClassId: row.promotedToClassId,
      nextTermStartDate: row.nextTermStartDate,
      status: row.status,
      publishedAt: row.publishedAt,
    };
  }
  return {
    conduct: null,
    interest: null,
    classTeacherRemark: null,
    headteacherRemark: null,
    promotionStatus: 'NOT_APPLICABLE',
    promotedToClassId: null,
    nextTermStartDate: null,
    status: 'DRAFT',
    publishedAt: null,
  };
}

// Builds one student's full report card payload — assumes scope has already
// been checked and shared per-class data (gradingConfig, subjects, ranking)
// has already been resolved by the caller, so bulk generation
// (getClassSummary) doesn't repeat that work once per student.
async function buildReportCardPayload(schoolId, {
  classId, termId, academicYearId, isEarlyYears, classSize, gradingConfig, subjects, ranking,
}, studentId) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const attendance = await attendanceService.getAttendanceSummary(schoolId, studentId, termId);
  const remarks = await getOrDefaultRemarks(schoolId, studentId, termId);
  const studentPayload = {
    id: student.id,
    fullName: student.fullName,
    studentNumber: student.studentNumber,
    photoUrl: student.photoUrl,
  };

  // Nursery/KG: no subjects/ranking at all — activity ratings, grouped by
  // domain, take their place. Position/aggregate don't apply (nothing
  // numeric to rank), classSize still does (roster size).
  if (isEarlyYears) {
    const activityDomains = await activitiesService.getConfirmedRatingsForReportCard(schoolId, {
      classId, termId, studentId,
    });
    return {
      student: studentPayload,
      classId,
      termId,
      academicYearId,
      isEarlyYears: true,
      subjects: [],
      activityDomains,
      attendance,
      position: null,
      classSize,
      aggregateScore: null,
      ...remarks,
    };
  }

  const examRows = await tenantScoped(ExamScore, schoolId).findAll({
    where: { studentId, classId, termId },
  });
  const examRowBySubject = new Map(examRows.map((row) => [row.subjectId, row]));

  const subjectRows = subjects.map((subject) => computeSubjectRow(subject, examRowBySubject.get(subject.id), gradingConfig));

  return {
    student: studentPayload,
    classId,
    termId,
    academicYearId,
    isEarlyYears: false,
    subjects: subjectRows,
    activityDomains: [],
    attendance,
    position: ranking.positions.get(studentId) ?? null,
    classSize: ranking.classSize,
    aggregateScore: ranking.aggregates.has(studentId) ? ranking.aggregates.get(studentId) : null,
    ...remarks,
  };
}

// Scope-agnostic aggregation, shared by the staff-facing (class-teacher/
// admin) and parent-facing (own-child-only, published-only) read paths —
// each caller applies its own access check before/after calling this.
async function assembleReportCard(schoolId, studentId, termId) {
  const { classId, academicYearId } = await resolveStudentClassForTerm(schoolId, studentId, termId);
  const level = await resolveClassLevel(schoolId, classId);

  if (isEarlyYearsCategory(level?.category)) {
    const roster = await resolveRoster(schoolId, classId, termId);
    return buildReportCardPayload(schoolId, {
      classId, termId, academicYearId, isEarlyYears: true, classSize: roster.length,
    }, studentId);
  }

  const gradingConfig = await resolveGradingConfig(schoolId);
  const subjects = await getClassSubjects(schoolId, classId, termId);
  const ranking = await getClassRanking(schoolId, classId, termId);

  return buildReportCardPayload(schoolId, {
    classId, termId, academicYearId, isEarlyYears: false, gradingConfig, subjects, ranking,
  }, studentId);
}

async function generateReportCard(schoolId, userId, roles, studentId, termId) {
  const { classId } = await resolveStudentClassForTerm(schoolId, studentId, termId);
  await assertClassTeacherOrAdmin(schoolId, { userId, roles, classId });
  return assembleReportCard(schoolId, studentId, termId);
}

// Parent-facing: no class-teacher-or-admin check (the caller — parentPortal/
// service.js — verifies the requesting parent actually owns this student
// instead), but a DRAFT report card is never returned regardless of who's
// asking, matching requirement #6's "parents see published cards only."
async function getPublishedReportCard(schoolId, studentId, termId) {
  const payload = await assembleReportCard(schoolId, studentId, termId);
  if (payload.status !== 'PUBLISHED') {
    throw new ApiError(404, 'This report card has not been published yet — check back once your school finalizes it.');
  }
  return payload;
}

async function getClassSummary(schoolId, userId, roles, classId, termId) {
  await assertClassTeacherOrAdmin(schoolId, { userId, roles, classId });

  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const roster = await resolveRoster(schoolId, classId, termId);
  const level = await resolveClassLevel(schoolId, classId);

  let context;
  if (isEarlyYearsCategory(level?.category)) {
    context = {
      classId, termId, academicYearId: term.academicYearId, isEarlyYears: true, classSize: roster.length,
    };
  } else {
    const gradingConfig = await resolveGradingConfig(schoolId);
    const subjects = await getClassSubjects(schoolId, classId, termId);
    const ranking = await getClassRanking(schoolId, classId, termId);
    context = {
      classId, termId, academicYearId: term.academicYearId, isEarlyYears: false, gradingConfig, subjects, ranking,
    };
  }

  const reportCards = [];
  for (const student of roster) {
    reportCards.push(await buildReportCardPayload(schoolId, context, student.id));
  }
  return { reportCards };
}

async function getOrCreateReportCardRow(schoolId, {
  studentId, classId, termId, academicYearId, staffId,
}) {
  const existing = await tenantScoped(ReportCard, schoolId).findOne({ where: { studentId, termId } });
  if (existing) return existing;
  return tenantScoped(ReportCard, schoolId).create({
    studentId, classId, termId, academicYearId, createdByStaffId: staffId,
  });
}

async function getRemarks(schoolId, userId, roles, studentId, termId) {
  const { classId } = await resolveStudentClassForTerm(schoolId, studentId, termId);
  await assertClassTeacherOrAdmin(schoolId, { userId, roles, classId });
  return getOrDefaultRemarks(schoolId, studentId, termId);
}

async function updateRemarks(schoolId, userId, roles, studentId, termId, {
  conduct, interest, classTeacherRemark, promotionStatus, promotedToClassId, nextTermStartDate,
}) {
  const { classId, academicYearId } = await resolveStudentClassForTerm(schoolId, studentId, termId);
  await assertClassTeacherOrAdmin(schoolId, { userId, roles, classId });

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  const row = await getOrCreateReportCardRow(schoolId, {
    studentId, classId, termId, academicYearId, staffId: staffMember ? staffMember.id : null,
  });

  if (row.status === 'PUBLISHED') {
    throw new ApiError(400, 'This report card has been published and can no longer be edited.');
  }

  await row.update({
    ...(conduct !== undefined ? { conduct } : {}),
    ...(interest !== undefined ? { interest } : {}),
    ...(classTeacherRemark !== undefined ? { classTeacherRemark } : {}),
    ...(promotionStatus !== undefined ? { promotionStatus } : {}),
    ...(promotedToClassId !== undefined ? { promotedToClassId } : {}),
    ...(nextTermStartDate !== undefined ? { nextTermStartDate } : {}),
  });
  return row;
}

// Restricted to HEAD_TEACHER/SCHOOL_ADMIN, enforced here (not just at the
// route) so a class teacher can never write this field even if the route
// guard were ever bypassed — a class teacher can edit every other remark
// but not the headteacher's own.
async function updateHeadteacherRemark(schoolId, userId, roles, studentId, termId, headteacherRemark) {
  if (!roles.includes('HEAD_TEACHER') && !roles.includes('SCHOOL_ADMIN')) {
    throw new ApiError(403, 'Only the headteacher or a school admin can set the headteacher remark.');
  }
  const { classId, academicYearId } = await resolveStudentClassForTerm(schoolId, studentId, termId);

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  const row = await getOrCreateReportCardRow(schoolId, {
    studentId, classId, termId, academicYearId, staffId: staffMember ? staffMember.id : null,
  });

  if (row.status === 'PUBLISHED') {
    throw new ApiError(400, 'This report card has been published and can no longer be edited.');
  }

  await row.update({ headteacherRemark });
  return row;
}

async function publishReportCard(schoolId, userId, roles, studentId, termId) {
  const { classId, academicYearId } = await resolveStudentClassForTerm(schoolId, studentId, termId);
  await assertClassTeacherOrAdmin(schoolId, { userId, roles, classId });

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  const row = await getOrCreateReportCardRow(schoolId, {
    studentId, classId, termId, academicYearId, staffId: staffMember ? staffMember.id : null,
  });

  await row.update({
    status: 'PUBLISHED', publishedAt: new Date(), publishedByStaffId: staffMember ? staffMember.id : null,
  });
  await notificationsService.notifyParentsOfStudent(schoolId, studentId, {
    type: 'REPORT_CARD_PUBLISHED',
    title: 'Report card published',
    body: 'Your child\'s report card for this term is now available.',
    linkUrl: `/parent/children/${studentId}/report-card`,
  });
  return row;
}

async function publishClassReportCards(schoolId, userId, roles, classId, termId) {
  await assertClassTeacherOrAdmin(schoolId, { userId, roles, classId });

  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const roster = await resolveRoster(schoolId, classId, termId);
  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });

  let publishedCount = 0;
  for (const student of roster) {
    const row = await getOrCreateReportCardRow(schoolId, {
      studentId: student.id, classId, termId, academicYearId: term.academicYearId, staffId: staffMember ? staffMember.id : null,
    });
    await row.update({
      status: 'PUBLISHED', publishedAt: new Date(), publishedByStaffId: staffMember ? staffMember.id : null,
    });
    await notificationsService.notifyParentsOfStudent(schoolId, student.id, {
      type: 'REPORT_CARD_PUBLISHED',
      title: 'Report card published',
      body: 'Your child\'s report card for this term is now available.',
      linkUrl: `/parent/children/${student.id}/report-card`,
    });
    publishedCount += 1;
  }
  return { publishedCount };
}

// Sets the same next-term start date across every student's report card row
// in one class/term, instead of a class teacher having to re-type it once
// per student on the single-student remarks form. Already-published rows
// are skipped (not editable, same rule as updateRemarks) rather than
// failing the whole batch — the caller is told how many of each.
async function setClassNextTermStartDate(schoolId, userId, roles, classId, termId, nextTermStartDate) {
  await assertClassTeacherOrAdmin(schoolId, { userId, roles, classId });

  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const roster = await resolveRoster(schoolId, classId, termId);
  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });

  let updatedCount = 0;
  let skippedCount = 0;
  for (const student of roster) {
    const row = await getOrCreateReportCardRow(schoolId, {
      studentId: student.id, classId, termId, academicYearId: term.academicYearId, staffId: staffMember ? staffMember.id : null,
    });
    if (row.status === 'PUBLISHED') {
      skippedCount += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await row.update({ nextTermStartDate });
    updatedCount += 1;
  }
  return { updatedCount, skippedCount };
}

module.exports = {
  generateReportCard,
  getPublishedReportCard,
  getClassSummary,
  getRemarks,
  updateRemarks,
  setClassNextTermStartDate,
  updateHeadteacherRemark,
  publishReportCard,
  publishClassReportCards,
  resolveStudentClassForTerm,
};
