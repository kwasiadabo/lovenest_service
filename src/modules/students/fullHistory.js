const {
  Student, StudentClassAssignment, Class, Level, AcademicYear, Term, AttendanceRecord, ExamScore, Subject,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const {
  attachParents, attachAdmissionPayments, admissionStageFor,
} = require('./service');
const { getStudentLedger } = require('../financials/service');
const { resolveGrade } = require('../assessment/service');
const { resolveGradingConfig } = require('../gradingSettings/service');
const healthService = require('../health/service');
const incidentsService = require('../incidents/service');

function classLabel(classRow) {
  if (!classRow) return null;
  return classRow.Level ? `${classRow.name} (${classRow.Level.name})` : classRow.name;
}

// Which sections a caller may see mirrors each domain's own route-level role
// gate elsewhere in the app (health/incidents/academics/attendance each
// already restrict who can view them to SCHOOL_ADMIN/HEAD_TEACHER, beyond
// this endpoint's own SCHOOL_ADMIN/ACCOUNTANT/HEAD_TEACHER gate) — this view
// must not hand an ACCOUNTANT anything they couldn't already see by visiting
// those pages directly.
function sectionAccess(roles) {
  const isAdminOrHeadTeacher = roles.includes('SCHOOL_ADMIN') || roles.includes('HEAD_TEACHER');
  return {
    academics: isAdminOrHeadTeacher,
    attendance: isAdminOrHeadTeacher,
    health: isAdminOrHeadTeacher,
    incidents: isAdminOrHeadTeacher,
  };
}

async function getClassHistory(schoolId, studentId) {
  const assignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
    where: { studentId },
    include: [{ model: Class, include: [Level] }, AcademicYear],
  });
  return assignments
    .filter((a) => a.AcademicYear)
    .sort((a, b) => new Date(a.AcademicYear.startDate) - new Date(b.AcademicYear.startDate))
    .map((a) => ({
      academicYearId: a.academicYearId,
      academicYearName: a.AcademicYear.name,
      classId: a.classId,
      className: classLabel(a.Class),
    }));
}

// Least-squares slope of score against term index — same "is this trending
// up or down" signal as assessment/service.js#getStudentSubjectTrend, kept
// local here rather than imported since it's a generic array-of-numbers
// helper, not exam-domain logic.
function trendDirectionFor(scores) {
  if (scores.length < 2) return 'INSUFFICIENT_DATA';
  const n = scores.length;
  const meanX = (n - 1) / 2;
  const meanY = scores.reduce((sum, v) => sum + v, 0) / n;
  let numerator = 0;
  let denominator = 0;
  scores.forEach((v, i) => {
    numerator += (i - meanX) * (v - meanY);
    denominator += (i - meanX) ** 2;
  });
  const slope = denominator !== 0 ? numerator / denominator : 0;
  if (slope > 1) return 'IMPROVING';
  if (slope < -1) return 'DECLINING';
  return 'STABLE';
}

async function getAcademicsHistory(schoolId, studentId) {
  const gradingConfig = await resolveGradingConfig(schoolId);
  const scores = await tenantScoped(ExamScore, schoolId).findAll({
    where: { studentId, status: 'CONFIRMED' },
    include: [Subject, { model: Term, include: [AcademicYear] }, { model: Class, include: [Level] }],
  });

  const rows = scores
    .filter((s) => s.Term && s.Term.AcademicYear)
    .sort((a, b) => {
      const yearDiff = new Date(a.Term.AcademicYear.startDate) - new Date(b.Term.AcademicYear.startDate);
      return yearDiff !== 0 ? yearDiff : a.Term.sequence - b.Term.sequence;
    })
    .map((score) => {
      const totalScore = Number(score.totalScore);
      return {
        subjectId: score.subjectId,
        subjectName: score.Subject?.name || 'Unknown',
        termName: score.Term.name,
        academicYearName: score.Term.AcademicYear.name,
        label: `${score.Term.AcademicYear.name} ${score.Term.name}`,
        classLabel: classLabel(score.Class),
        totalScore,
        grade: resolveGrade(totalScore, gradingConfig.gradeBands).grade,
        confirmedAt: score.confirmedAt,
      };
    });

  const bySubject = new Map();
  for (const row of rows) {
    const entry = bySubject.get(row.subjectId) || { subjectId: row.subjectId, subjectName: row.subjectName, history: [] };
    entry.history.push(row);
    bySubject.set(row.subjectId, entry);
  }

  const subjects = [...bySubject.values()].map((entry) => {
    const scoreValues = entry.history.map((h) => h.totalScore);
    return {
      subjectId: entry.subjectId,
      subjectName: entry.subjectName,
      history: entry.history,
      averageScore: Math.round((scoreValues.reduce((sum, v) => sum + v, 0) / scoreValues.length) * 10) / 10,
      trendDirection: trendDirectionFor(scoreValues),
    };
  }).sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  return { subjects, allScores: rows };
}

async function getAttendanceHistory(schoolId, studentId) {
  const records = await tenantScoped(AttendanceRecord, schoolId).findAll({
    where: { studentId },
    include: [{ model: Term, include: [AcademicYear] }],
    order: [['date', 'ASC']],
  });

  const byTerm = new Map();
  for (const record of records.filter((r) => r.Term && r.Term.AcademicYear)) {
    const key = record.termId;
    const entry = byTerm.get(key) || {
      termId: key,
      termName: record.Term.name,
      academicYearName: record.Term.AcademicYear.name,
      startDate: record.Term.AcademicYear.startDate,
      sequence: record.Term.sequence,
      present: 0,
      late: 0,
      absent: 0,
    };
    if (record.status === 'PRESENT') entry.present += 1;
    else if (record.status === 'LATE') entry.late += 1;
    else if (record.status === 'ABSENT') entry.absent += 1;
    byTerm.set(key, entry);
  }

  const byTermSorted = [...byTerm.values()]
    .sort((a, b) => (new Date(a.startDate) - new Date(b.startDate)) || (a.sequence - b.sequence))
    .map((t) => ({
      termId: t.termId,
      termName: t.termName,
      academicYearName: t.academicYearName,
      present: t.present,
      late: t.late,
      absent: t.absent,
      totalDaysRecorded: t.present + t.late + t.absent,
    }));

  return {
    byTerm: byTermSorted,
    summary: {
      present: records.filter((r) => r.status === 'PRESENT').length,
      late: records.filter((r) => r.status === 'LATE').length,
      absent: records.filter((r) => r.status === 'ABSENT').length,
      totalDaysRecorded: records.length,
    },
  };
}

// A single student's complete record across every domain the app tracks —
// admission, class history, billing ledger, exam scores, attendance, health,
// and incidents — attached to the admin-side Student Profile page. `roles`
// gates which sections come back (see sectionAccess) so this never shows an
// ACCOUNTANT anything beyond what they could already reach elsewhere.
async function getStudentFullHistory(schoolId, roles, studentId) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const [withParents] = await attachParents(schoolId, [student]);
  const paymentsByStudentId = await attachAdmissionPayments(schoolId, [student]);
  const admissionPayment = paymentsByStudentId.get(student.id) || null;

  const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  const currentClassAssignment = currentYear
    ? await tenantScoped(StudentClassAssignment, schoolId).findOne({
      where: { studentId: student.id, academicYearId: currentYear.id },
      include: [{ model: Class, include: [Level] }],
    })
    : null;

  const access = sectionAccess(roles);

  const [classHistory, ledger, academics, attendance, sickBayVisits, medicationLogs, immunizations, incidents] = await Promise.all([
    getClassHistory(schoolId, studentId),
    getStudentLedger(schoolId, studentId),
    access.academics ? getAcademicsHistory(schoolId, studentId) : null,
    access.attendance ? getAttendanceHistory(schoolId, studentId) : null,
    access.health ? healthService.listSickBayVisits(schoolId, { studentId }) : null,
    access.health ? healthService.listMedicationLogs(schoolId, { studentId }) : null,
    access.health ? healthService.listImmunizations(schoolId, { studentId }) : null,
    access.incidents ? incidentsService.listIncidents(schoolId, { studentId, subjectType: 'STUDENT' }) : null,
  ]);

  return {
    profile: {
      ...withParents,
      admissionPayment,
      currentClassAssignment,
      admissionStage: admissionStageFor(!!currentClassAssignment, !!admissionPayment),
    },
    classHistory,
    finance: ledger,
    academics,
    attendance,
    health: access.health ? { sickBayVisits, medicationLogs, immunizations } : null,
    incidents,
  };
}

module.exports = { getStudentFullHistory };
