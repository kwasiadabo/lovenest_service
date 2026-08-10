const { Op } = require('sequelize');
const {
  sequelize, Class, Level, Subject, Term, AcademicYear, Staff, SubjectTeacher, ClassTeacher,
  AssessmentItem, AssessmentScore, ExamScore, Student,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { resolveGradingConfig } = require('../gradingSettings/service');
const { resolveRoster } = require('../../utils/classRoster');

// Fine-grained scoping (roleGuard.js's own comment anticipates this):
// SCHOOL_ADMIN/HEAD_TEACHER may score any class+subject; a plain TEACHER is
// restricted to (a) the specific class+subject pairs they're assigned to via
// SubjectTeacher, or (b) any subject at all within a class they're the
// ClassTeacher (homeroom teacher) for — real schools routinely have the
// class teacher fill in marks across the board for their own class, not just
// their own subject. Re-checked on every read and write, never cached at
// login — a TEACHER must not even be able to view a class/subject they don't
// teach, not just be blocked from editing it.
async function assertScopeAccess(schoolId, {
  userId, roles, classId, subjectId,
}) {
  if (roles.includes('SCHOOL_ADMIN') || roles.includes('HEAD_TEACHER')) return;

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  if (!staffMember) {
    throw new ApiError(403, 'You are not the assigned teacher for this class and subject, so you cannot access it or enter marks.');
  }

  const isClassTeacher = await tenantScoped(ClassTeacher, schoolId).findOne({
    where: { staffId: staffMember.id, classId },
  });
  if (isClassTeacher) return;

  const assignment = await tenantScoped(SubjectTeacher, schoolId).findOne({
    where: { staffId: staffMember.id, classId, subjectId },
  });
  if (!assignment) {
    throw new ApiError(403, 'You are not the assigned teacher for this class and subject, so you cannot access it or enter marks.');
  }
}

async function getMyAssignments(schoolId, userId, roles) {
  if (roles.includes('SCHOOL_ADMIN') || roles.includes('HEAD_TEACHER')) {
    return { unrestricted: true, assignments: [] };
  }

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  if (!staffMember) return { unrestricted: false, assignments: [] };

  const subjectAssignments = await tenantScoped(SubjectTeacher, schoolId).findAll({
    where: { staffId: staffMember.id },
    include: [{ model: Class, include: [Level] }, Subject],
  });

  // A class teacher gets every subject in their own class(es) too — see
  // assertScopeAccess's comment. Subjects aren't scoped to a class/level in
  // this schema (Subject is school-wide, see models/subject.js), so "every
  // subject within that class" means every Subject the school has.
  const classTeacherRows = await tenantScoped(ClassTeacher, schoolId).findAll({
    where: { staffId: staffMember.id },
    include: [{ model: Class, include: [Level] }],
  });
  const allSubjects = classTeacherRows.length > 0 ? await tenantScoped(Subject, schoolId).findAll() : [];

  const seen = new Set();
  const assignments = [];
  const addAssignment = (classRow, subjectRow) => {
    const key = `${classRow.id}:${subjectRow.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    assignments.push({
      classId: classRow.id,
      className: classRow.name,
      levelId: classRow.levelId,
      subjectId: subjectRow.id,
      subjectName: subjectRow.name,
    });
  };

  subjectAssignments.forEach((a) => addAssignment(a.Class, a.Subject));
  classTeacherRows.forEach((ct) => {
    allSubjects.forEach((subject) => addAssignment(ct.Class, subject));
  });

  return { unrestricted: false, assignments };
}

// The staff formally assigned to this class+subject (regardless of who's
// actually logged in doing the data entry right now) — shown in the UI as
// context for "whose class/subject is this."
async function getAssignedTeacher(schoolId, classId, subjectId) {
  const assignment = await tenantScoped(SubjectTeacher, schoolId).findOne({
    where: { classId, subjectId },
    include: [Staff],
  });
  return assignment?.Staff ? { staffId: assignment.Staff.id, fullName: assignment.Staff.fullName } : null;
}

// Exam Scores accepts classwork and exam marks directly (each 0-100 or
// already-weighted, per the caller's explicit entryMode — see validators.js;
// the server no longer guesses which convention a figure is in), independent
// of the granular Classwork/Project item grids.
function scaleForMode(value, entryMode, weight) {
  return entryMode === 'RAW' ? value * weight : value;
}

async function getAssessmentGrid(schoolId, userId, roles, {
  classId, subjectId, termId, type,
}) {
  await assertScopeAccess(schoolId, {
    userId, roles, classId, subjectId,
  });
  const students = await resolveRoster(schoolId, classId, termId);
  const items = await tenantScoped(AssessmentItem, schoolId).findAll({
    where: {
      classId, subjectId, termId, type,
    },
    include: [{ model: Staff, as: 'createdBy' }],
    order: [['createdAt', 'ASC']],
  });

  const itemIds = items.map((i) => i.id);
  const scores = itemIds.length > 0
    ? await tenantScoped(AssessmentScore, schoolId).findAll({ where: { assessmentItemId: itemIds } })
    : [];

  const scoresByStudent = {};
  for (const score of scores) {
    scoresByStudent[score.studentId] = scoresByStudent[score.studentId] || {};
    scoresByStudent[score.studentId][score.assessmentItemId] = score.rawScore === null ? null : Number(score.rawScore);
  }

  return {
    students,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      maxScore: Number(i.maxScore),
      type: i.type,
      createdByName: i.createdBy ? i.createdBy.fullName : null,
    })),
    scores: scoresByStudent,
    assignedTeacher: await getAssignedTeacher(schoolId, classId, subjectId),
  };
}

async function assertEntitiesExist(schoolId, { classId, subjectId, termId }) {
  const klass = await tenantScoped(Class, schoolId).findByPk(classId);
  if (!klass) throw new ApiError(404, 'Class not found');
  const subject = await tenantScoped(Subject, schoolId).findByPk(subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');
}

async function createAssessmentItem(schoolId, userId, roles, {
  classId, subjectId, termId, type, name, maxScore,
}) {
  await assertScopeAccess(schoolId, {
    userId, roles, classId, subjectId,
  });
  await assertEntitiesExist(schoolId, { classId, subjectId, termId });

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });

  const item = await tenantScoped(AssessmentItem, schoolId).create({
    classId,
    subjectId,
    termId,
    type,
    name,
    maxScore,
    createdByStaffId: staffMember ? staffMember.id : null,
  });

  // createdByName isn't a column — attached here so the frontend can show
  // "added by" from the mutation response, without a second lookup.
  return { ...item.toJSON(), createdByName: staffMember ? staffMember.fullName : null };
}

async function updateAssessmentItem(schoolId, userId, roles, itemId, { name, maxScore }) {
  const item = await tenantScoped(AssessmentItem, schoolId).findByPk(itemId);
  if (!item) throw new ApiError(404, 'Assessment item not found');
  await assertScopeAccess(schoolId, {
    userId, roles, classId: item.classId, subjectId: item.subjectId,
  });

  await item.update({
    ...(name !== undefined ? { name } : {}),
    ...(maxScore !== undefined ? { maxScore } : {}),
  });
  return item;
}

async function deleteAssessmentItem(schoolId, userId, roles, itemId) {
  const item = await tenantScoped(AssessmentItem, schoolId).findByPk(itemId);
  if (!item) throw new ApiError(404, 'Assessment item not found');
  await assertScopeAccess(schoolId, {
    userId, roles, classId: item.classId, subjectId: item.subjectId,
  });

  // assessmentItemId is NO ACTION, not CASCADE (see the create-assessment-
  // scores migration), so scores must be cleared explicitly before the item.
  await sequelize.transaction(async (transaction) => {
    await tenantScoped(AssessmentScore, schoolId).destroy({ where: { assessmentItemId: itemId }, transaction });
    await tenantScoped(AssessmentItem, schoolId).destroy({ where: { id: itemId }, transaction });
  });
}

async function upsertScore(schoolId, userId, roles, { itemId, studentId, rawScore }) {
  const item = await tenantScoped(AssessmentItem, schoolId).findByPk(itemId);
  if (!item) throw new ApiError(404, 'Assessment item not found');
  await assertScopeAccess(schoolId, {
    userId, roles, classId: item.classId, subjectId: item.subjectId,
  });

  if (rawScore !== null && rawScore !== undefined) {
    const numeric = Number(rawScore);
    if (Number.isNaN(numeric) || numeric < 0 || numeric > Number(item.maxScore)) {
      throw new ApiError(400, `rawScore must be between 0 and ${item.maxScore}`);
    }
  }

  const existing = await tenantScoped(AssessmentScore, schoolId).findOne({
    where: { assessmentItemId: itemId, studentId },
  });
  if (existing) {
    existing.rawScore = rawScore === undefined ? null : rawScore;
    await existing.save();
    return existing;
  }
  return tenantScoped(AssessmentScore, schoolId).create({
    assessmentItemId: itemId, studentId, rawScore: rawScore === undefined ? null : rawScore,
  });
}

// Batch version of the Classwork/Project item averages, for every student in
// the roster at once — mirrors AssessmentGridPage.jsx's client-side
// `rowAverage` (a plain mean of each item's rawScore/maxScore*100, skipping
// items the student has no score for yet), computed here server-side so it
// can also be blended into the Exam Scores "classwork" figure when
// classworkSourceMode is COMPUTED (see getExamGrid/saveExamScore below).
async function computeClassworkSourceAverages(schoolId, {
  classId, subjectId, termId, studentIds,
}) {
  const result = {};
  studentIds.forEach((id) => { result[id] = { classworkAverage: null, projectAverage: null }; });
  if (studentIds.length === 0) return result;

  const items = await tenantScoped(AssessmentItem, schoolId).findAll({
    where: { classId, subjectId, termId },
  });
  if (items.length === 0) return result;

  const itemIds = items.map((i) => i.id);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const scores = await tenantScoped(AssessmentScore, schoolId).findAll({
    where: { assessmentItemId: itemIds, studentId: studentIds },
  });

  // studentId -> type -> [percent, percent, ...]
  const percentsByStudentType = new Map();
  for (const score of scores) {
    if (score.rawScore === null) continue;
    const item = itemById.get(score.assessmentItemId);
    if (!item) continue;
    const percent = (Number(score.rawScore) / Number(item.maxScore)) * 100;
    if (!percentsByStudentType.has(score.studentId)) percentsByStudentType.set(score.studentId, {});
    const byType = percentsByStudentType.get(score.studentId);
    byType[item.type] = byType[item.type] || [];
    byType[item.type].push(percent);
  }

  const average = (arr) => (arr && arr.length > 0 ? arr.reduce((sum, v) => sum + v, 0) / arr.length : null);
  for (const studentId of studentIds) {
    const byType = percentsByStudentType.get(studentId) || {};
    result[studentId] = {
      classworkAverage: average(byType.CLASSWORK),
      projectAverage: average(byType.PROJECT),
    };
  }
  return result;
}

// Blends the two category averages by the school's configured weights. A
// missing category (no items scored yet — very normal early in a term) is
// excluded and the other category's weight is renormalized to 100%, rather
// than being treated as a zero — see feature discussion: penalizing a
// student (or blocking entry) for a category simply not populated yet would
// misrepresent them or hold up grading unnecessarily.
function blendClassworkSource(classworkAverage, projectAverage, classworkWeight, projectWeight) {
  if (classworkAverage === null && projectAverage === null) return null;
  if (classworkAverage === null) return projectAverage;
  if (projectAverage === null) return classworkAverage;
  return classworkAverage * classworkWeight + projectAverage * projectWeight;
}

async function getExamGrid(schoolId, userId, roles, { classId, subjectId, termId }) {
  await assertScopeAccess(schoolId, {
    userId, roles, classId, subjectId,
  });
  const students = await resolveRoster(schoolId, classId, termId);
  const studentIds = students.map((s) => s.id);

  const gradingConfig = await resolveGradingConfig(schoolId);
  const computedClasswork = {};
  if (gradingConfig.classworkSourceMode === 'COMPUTED') {
    const averages = await computeClassworkSourceAverages(schoolId, {
      classId, subjectId, termId, studentIds,
    });
    for (const studentId of studentIds) {
      const { classworkAverage, projectAverage } = averages[studentId];
      computedClasswork[studentId] = {
        classworkAverage,
        projectAverage,
        blended: blendClassworkSource(
          classworkAverage,
          projectAverage,
          gradingConfig.classworkWeight,
          gradingConfig.projectWeight,
        ),
      };
    }
  }

  const examRows = studentIds.length > 0
    ? await tenantScoped(ExamScore, schoolId).findAll({
      where: {
        classId, subjectId, termId, studentId: studentIds,
      },
      include: [{ model: Staff, as: 'recordedBy' }, { model: Staff, as: 'confirmedBy' }],
    })
    : [];

  const examScores = {};
  for (const row of examRows) {
    examScores[row.studentId] = {
      caPercent: Number(row.caPercent),
      caScaled: Number(row.caScaled),
      examRaw: Number(row.examRaw),
      examScaled: Number(row.examScaled),
      totalScore: Number(row.totalScore),
      effort: row.effort,
      updatedAt: row.updatedAt,
      recordedByName: row.recordedBy ? row.recordedBy.fullName : null,
      status: row.status,
      confirmedAt: row.confirmedAt,
      confirmedByName: row.confirmedBy ? row.confirmedBy.fullName : null,
    };
  }

  // The sheet reads as "confirmed" once every entry that exists is locked —
  // a student never scored isn't part of the confirmed set, so their
  // absence doesn't block the rest of the class from showing as confirmed.
  const allConfirmed = examRows.length > 0 && examRows.every((row) => row.status === 'CONFIRMED');

  return {
    students,
    examScores,
    allConfirmed,
    assignedTeacher: await getAssignedTeacher(schoolId, classId, subjectId),
    classworkSourceMode: gradingConfig.classworkSourceMode,
    // Only populated in COMPUTED mode — MANUAL mode's classwork column is a
    // plain editable input and has no use for this.
    computedClasswork,
  };
}

async function saveExamScore(schoolId, userId, roles, {
  classId, subjectId, termId, studentId, classworkRaw, examRaw, entryMode, effort,
}) {
  await assertScopeAccess(schoolId, {
    userId, roles, classId, subjectId,
  });
  await assertEntitiesExist(schoolId, { classId, subjectId, termId });

  const gradingConfig = await resolveGradingConfig(schoolId);
  const { caWeight, examWeight } = gradingConfig;
  const classworkComputed = gradingConfig.classworkSourceMode === 'COMPUTED';

  // WEIGHTED entry's ceiling depends on the school's configured weights
  // (e.g. caWeight 0.3 -> a WEIGHTED classworkRaw can be at most 30) — RAW's
  // fixed 0-100 ceiling is already checked in validators.js; this is the
  // DB-dependent half of that same check, deferred here (see validators.js's
  // comment on why). The classworkRaw side of this only applies when
  // classwork is manually entered — in COMPUTED mode there's nothing for the
  // teacher to type, so it's skipped entirely below.
  if (entryMode === 'WEIGHTED') {
    const examCeiling = examWeight * 100;
    if (!classworkComputed) {
      const caCeiling = caWeight * 100;
      if (Number(classworkRaw) > caCeiling) {
        throw new ApiError(400, `classworkRaw must be between 0 and ${caCeiling} for weighted entry`);
      }
    }
    if (Number(examRaw) > examCeiling) {
      throw new ApiError(400, `examRaw must be between 0 and ${examCeiling} for weighted entry`);
    }
  }

  // In COMPUTED mode, whatever classworkRaw the client sent is ignored and
  // recomputed fresh here — the server is the single source of truth so a
  // stale client value (e.g. a Classwork/Project mark changed after the page
  // loaded) can never be silently persisted. The blended average is always a
  // plain 0-100 percentage regardless of the page's RAW/WEIGHTED toggle
  // (that toggle only governs how the *exam* mark is interpreted here), so
  // it's scaled by caWeight directly rather than through scaleForMode. A
  // student with no Classwork or Project scores recorded yet blends to
  // null, which falls back to 0 — same "blank means 0" convention the
  // frontend already applies to an empty manual-entry field.
  let caPercent;
  if (classworkComputed) {
    const averages = await computeClassworkSourceAverages(schoolId, {
      classId, subjectId, termId, studentIds: [studentId],
    });
    const { classworkAverage, projectAverage } = averages[studentId];
    const blended = blendClassworkSource(
      classworkAverage, projectAverage, gradingConfig.classworkWeight, gradingConfig.projectWeight,
    );
    caPercent = blended === null ? 0 : blended;
  } else {
    caPercent = Number(classworkRaw);
  }

  const examRawNum = Number(examRaw);
  const caScaled = classworkComputed ? caPercent * caWeight : scaleForMode(caPercent, entryMode, caWeight);
  const examScaled = scaleForMode(examRawNum, entryMode, examWeight);
  const totalScore = caScaled + examScaled;

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  const values = {
    caPercent,
    caScaled,
    examRaw: examRawNum,
    examScaled,
    totalScore,
    recordedByStaffId: staffMember ? staffMember.id : null,
    // Only touched when the caller actually sent it (see
    // updateExamScoreEffort below for the Effort select's own save path) —
    // a routine classwork/exam save must never silently null out an
    // already-set effort grade just because that field wasn't part of this
    // particular request.
    ...(effort !== undefined ? { effort: effort || null } : {}),
  };

  const existing = await tenantScoped(ExamScore, schoolId).findOne({
    where: {
      classId, subjectId, termId, studentId,
    },
  });
  if (existing && existing.status === 'CONFIRMED') {
    throw new ApiError(400, 'This exam sheet has been confirmed and can no longer be edited. Ask a school admin to reopen it first.');
  }

  const saved = existing
    ? await existing.update(values)
    : await tenantScoped(ExamScore, schoolId).create({
      classId, subjectId, termId, studentId, ...values,
    });

  // recordedByName isn't a column — attached here so the frontend can show
  // "who saved this" from the mutation response, without a second lookup.
  return { ...saved.toJSON(), recordedByName: staffMember ? staffMember.fullName : null };
}

// A separate, lightweight save path for the Effort select — deliberately
// not folded into saveExamScore above, which recomputes/persists
// caScaled/examScaled/totalScore from RAW/WEIGHTED entry-mode marks; an
// effort-only save has none of that context (no classworkRaw/examRaw/
// entryMode) and must never risk touching the score fields. Requires the
// row to already exist (a teacher sets effort after marks, not before).
async function updateExamScoreEffort(schoolId, userId, roles, {
  classId, subjectId, termId, studentId, effort,
}) {
  await assertScopeAccess(schoolId, {
    userId, roles, classId, subjectId,
  });

  const existing = await tenantScoped(ExamScore, schoolId).findOne({
    where: {
      classId, subjectId, termId, studentId,
    },
  });
  if (!existing) throw new ApiError(400, 'Enter this student\'s classwork and exam marks before setting an effort grade.');
  if (existing.status === 'CONFIRMED') {
    throw new ApiError(400, 'This exam sheet has been confirmed and can no longer be edited. Ask a school admin to reopen it first.');
  }

  await existing.update({ effort: effort || null });
  return existing.toJSON();
}

// Locks every currently-existing exam score row for a class+subject+term —
// "the entries that were made," not the whole roster, so a student never
// scored simply isn't part of the confirmed set (see getExamGrid's
// allConfirmed comment). Confirming is allowed to whoever could edit the
// scope in the first place; reopening is a SCHOOL_ADMIN-only escape hatch
// (see reopenExamScores) so a genuine mistake isn't a dead end.
async function confirmExamScores(schoolId, userId, roles, { classId, subjectId, termId }) {
  await assertScopeAccess(schoolId, {
    userId, roles, classId, subjectId,
  });
  await assertEntitiesExist(schoolId, { classId, subjectId, termId });

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });

  const [confirmedCount] = await tenantScoped(ExamScore, schoolId).update({
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    confirmedByStaffId: staffMember ? staffMember.id : null,
  }, {
    where: {
      classId, subjectId, termId, status: 'DRAFT',
    },
  });

  if (confirmedCount === 0) {
    throw new ApiError(400, 'No exam scores have been entered for this class yet.');
  }

  return { confirmedCount };
}

// SCHOOL_ADMIN only, regardless of who's otherwise scoped to this
// class/subject — a plain TEACHER or HEAD_TEACHER cannot undo a
// confirmation themselves (enforced again here, not just at the route, in
// case this is ever called from elsewhere).
async function reopenExamScores(schoolId, userId, roles, { classId, subjectId, termId }) {
  if (!roles.includes('SCHOOL_ADMIN')) {
    throw new ApiError(403, 'Only a school admin can reopen a confirmed exam sheet.');
  }
  await assertEntitiesExist(schoolId, { classId, subjectId, termId });

  const [reopenedCount] = await tenantScoped(ExamScore, schoolId).update({
    status: 'DRAFT',
    confirmedAt: null,
    confirmedByStaffId: null,
  }, {
    where: {
      classId, subjectId, termId, status: 'CONFIRMED',
    },
  });

  return { reopenedCount };
}

// Highest grade band whose minScore doesn't exceed totalScore — same
// bucketing rule as reportCards/service.js#resolveGrade, duplicated locally
// rather than imported since it's a small pure function and reportCards
// doesn't export it.
function resolveGrade(totalScore, gradeBands) {
  const sorted = [...gradeBands].sort((a, b) => a.minScore - b.minScore);
  let matched = null;
  for (const band of sorted) {
    if (totalScore >= band.minScore) matched = band;
    else break;
  }
  return matched ? { grade: matched.grade, remark: matched.remark } : { grade: null, remark: null };
}

// The lowest score that counts as a pass — derived from whichever grade
// band's remark reads as "pass" (case-insensitive substring, so a school's
// own wording like "Pass" or "Credit/Pass" still matches) rather than
// hardcoded, since grade bands are school-configurable. Falls back to 50,
// this app's own default scale's pass threshold, if no band says "pass".
function resolvePassMark(gradeBands) {
  const passBand = gradeBands.find((b) => (b.remark || '').toLowerCase().includes('pass'));
  return passBand ? passBand.minScore : 50;
}

// ---- Exam analytics ----
// Scoped to one academic year + term across every class, mirroring
// financials/service.js#getBillAnalytics: single query, in-memory Map
// grouping, sorted arrays out. `termTrend` is the one exception — it looks
// across every term in the academic year (not just the selected one) so a
// school can see whether performance is improving or slipping term to term,
// the same "context beyond the single scope" role schoolWide plays there.
// `pairs` ([{classId, subjectId}]), when given, narrows every query to just
// those class+subject combinations — this is what getMyExamAnalytics uses
// to scope the same aggregation down to one subject teacher's own
// assignments (precise per-pairing, unlike an independent classId/subjectId
// filter, which would leak a colleague's subject in a shared class).
// `classId`, when given on its own, is a plain whole-class filter for
// SCHOOL_ADMIN/HEAD_TEACHER on the Exam Analytics screen — narrower than
// "every class" but not tied to any one subject, so it combines with
// `pairs` by simple AND rather than replacing it.
async function getExamAnalytics(schoolId, {
  academicYearId, termId, classId, pairs,
}) {
  if (!academicYearId || !termId) throw new ApiError(400, 'academicYearId and termId are required');

  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const gradingConfig = await resolveGradingConfig(schoolId);
  const passMark = resolvePassMark(gradingConfig.gradeBands);

  const pairScope = pairs?.length
    ? { [Op.or]: pairs.map((p) => ({ classId: p.classId, subjectId: p.subjectId })) }
    : {};
  const classScope = classId ? { classId } : {};

  const scores = await tenantScoped(ExamScore, schoolId).findAll({
    where: {
      termId, status: 'CONFIRMED', ...classScope, ...pairScope,
    },
    include: [
      { model: Class, include: [Level] },
      Subject,
      Student,
    ],
  });

  const classMap = new Map();
  const subjectMap = new Map();
  const gradeMap = new Map();
  const studentMap = new Map();
  let totalScoreSum = 0;
  let passCount = 0;

  for (const score of scores) {
    const totalScore = Number(score.totalScore);
    totalScoreSum += totalScore;
    const isPass = totalScore >= passMark;
    if (isPass) passCount += 1;

    const { grade } = resolveGrade(totalScore, gradingConfig.gradeBands);
    gradeMap.set(grade, (gradeMap.get(grade) || 0) + 1);

    const classKey = score.classId;
    const classEntry = classMap.get(classKey) || {
      classId: classKey,
      name: score.Class?.name || 'Unknown',
      levelName: score.Class?.Level?.name || null,
      count: 0,
      scoreSum: 0,
      passCount: 0,
      studentIds: new Set(),
      subjectIds: new Set(),
    };
    classEntry.count += 1;
    classEntry.scoreSum += totalScore;
    if (isPass) classEntry.passCount += 1;
    classEntry.studentIds.add(score.studentId);
    classEntry.subjectIds.add(score.subjectId);
    classMap.set(classKey, classEntry);

    const subjectKey = score.subjectId;
    const subjectEntry = subjectMap.get(subjectKey) || {
      subjectId: subjectKey,
      name: score.Subject?.name || 'Unknown',
      count: 0,
      scoreSum: 0,
      passCount: 0,
      highest: totalScore,
      lowest: totalScore,
    };
    subjectEntry.count += 1;
    subjectEntry.scoreSum += totalScore;
    if (isPass) subjectEntry.passCount += 1;
    subjectEntry.highest = Math.max(subjectEntry.highest, totalScore);
    subjectEntry.lowest = Math.min(subjectEntry.lowest, totalScore);
    subjectMap.set(subjectKey, subjectEntry);

    const studentKey = score.studentId;
    const studentEntry = studentMap.get(studentKey) || {
      studentId: studentKey,
      studentName: score.Student?.fullName || 'Unknown',
      classLabel: score.Class
        ? [score.Class.Level?.name, score.Class.name].filter(Boolean).join(' — ')
        : null,
      count: 0,
      scoreSum: 0,
    };
    studentEntry.count += 1;
    studentEntry.scoreSum += totalScore;
    studentMap.set(studentKey, studentEntry);
  }

  const byClass = [...classMap.values()]
    .map((c) => ({
      classId: c.classId,
      name: c.name,
      levelName: c.levelName,
      studentCount: c.studentIds.size,
      subjectCount: c.subjectIds.size,
      count: c.count,
      averageScore: c.count > 0 ? Math.round((c.scoreSum / c.count) * 10) / 10 : 0,
      passRate: c.count > 0 ? Math.round((c.passCount / c.count) * 100) : 0,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);

  const bySubject = [...subjectMap.values()]
    .map((s) => ({
      subjectId: s.subjectId,
      name: s.name,
      count: s.count,
      averageScore: s.count > 0 ? Math.round((s.scoreSum / s.count) * 10) / 10 : 0,
      passRate: s.count > 0 ? Math.round((s.passCount / s.count) * 100) : 0,
      highest: s.highest,
      lowest: s.lowest,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);

  const gradeDistribution = [...gradeMap.entries()]
    .map(([grade, count]) => ({ grade: grade || 'Ungraded', count }))
    .sort((a, b) => b.count - a.count);

  const scoreValues = scores.map((s) => Number(s.totalScore));
  let scoreDistribution = [];
  if (scoreValues.length > 0) {
    const bucketSize = 10;
    const bucketCount = Math.ceil(100 / bucketSize);
    const counts = new Array(bucketCount).fill(0);
    for (const value of scoreValues) {
      const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(value / bucketSize)));
      counts[index] += 1;
    }
    scoreDistribution = counts.map((count, i) => ({
      rangeStart: i * bucketSize,
      rangeEnd: i * bucketSize + bucketSize - 1,
      count,
    }));
  }

  const topPerformers = [...studentMap.values()]
    .map((s) => ({
      studentId: s.studentId,
      studentName: s.studentName,
      classLabel: s.classLabel,
      subjectCount: s.count,
      averageScore: s.count > 0 ? Math.round((s.scoreSum / s.count) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, 10);

  const yearTerms = await tenantScoped(Term, schoolId).findAll({
    where: { academicYearId },
    order: [['sequence', 'ASC']],
  });
  const yearTermScores = await tenantScoped(ExamScore, schoolId).findAll({
    where: {
      termId: yearTerms.map((t) => t.id), status: 'CONFIRMED', ...classScope, ...pairScope,
    },
    attributes: ['termId', 'totalScore'],
  });
  const trendByTerm = new Map();
  for (const score of yearTermScores) {
    const entry = trendByTerm.get(score.termId) || { count: 0, scoreSum: 0, passCount: 0 };
    const totalScore = Number(score.totalScore);
    entry.count += 1;
    entry.scoreSum += totalScore;
    if (totalScore >= passMark) entry.passCount += 1;
    trendByTerm.set(score.termId, entry);
  }
  const termTrend = yearTerms.map((t) => {
    const entry = trendByTerm.get(t.id) || { count: 0, scoreSum: 0, passCount: 0 };
    return {
      termId: t.id,
      termName: t.name,
      count: entry.count,
      averageScore: entry.count > 0 ? Math.round((entry.scoreSum / entry.count) * 10) / 10 : 0,
      passRate: entry.count > 0 ? Math.round((entry.passCount / entry.count) * 100) : 0,
    };
  });

  return {
    scope: { academicYearId, termId, termName: term.name },
    summary: {
      totalConfirmedScores: scores.length,
      distinctStudents: studentMap.size,
      distinctSubjects: subjectMap.size,
      distinctClasses: classMap.size,
      averageScore: scores.length > 0 ? Math.round((totalScoreSum / scores.length) * 10) / 10 : 0,
      passCount,
      passRate: scores.length > 0 ? Math.round((passCount / scores.length) * 100) : 0,
      passMark,
    },
    byClass,
    bySubject,
    gradeDistribution,
    scoreDistribution,
    topPerformers,
    termTrend,
  };
}

// A subject teacher's own exam analytics — same shape as getExamAnalytics,
// pre-scoped to whichever class+subject pairs the caller is assigned to
// (via getMyAssignments), for the Teacher Dashboard. SCHOOL_ADMIN/
// HEAD_TEACHER get `unrestricted: true` with no assignments; same as
// attendance's getMyAttendanceAnalytics, that's a "not meant for you here"
// signal, not a fallback to whole-school data.
async function getMyExamAnalytics(schoolId, userId, roles, { academicYearId, termId }) {
  if (!academicYearId || !termId) throw new ApiError(400, 'academicYearId and termId are required');

  const { unrestricted, assignments } = await getMyAssignments(schoolId, userId, roles);
  if (unrestricted || assignments.length === 0) {
    return {
      scope: { academicYearId, termId }, noAssignments: true, assignments: [],
    };
  }

  const analytics = await getExamAnalytics(schoolId, {
    academicYearId, termId, pairs: assignments.map((a) => ({ classId: a.classId, subjectId: a.subjectId })),
  });
  return { ...analytics, noAssignments: false, assignments };
}

// ---- Student subject trend ----
// A single student's confirmed exam scores in one subject across every term
// they've ever been scored in — not just the current year — so a teacher,
// head teacher, or admin can see whether the student is improving or
// declining, independent of which class they were in at the time (a student
// who was promoted mid-history still shows one continuous line).

// Every subject a student has at least one CONFIRMED exam score in, across
// any class/term on record — same dedupe-via-Map pattern as reportCards/
// service.js#getClassSubjects, just keyed off one student instead of a
// class+term. Exported for parentPortal/service.js, which has no class/
// teacher-assignment context to derive a subject picker from otherwise.
async function getStudentSubjects(schoolId, studentId) {
  const rows = await tenantScoped(ExamScore, schoolId).findAll({
    where: { studentId, status: 'CONFIRMED' },
    include: [Subject],
  });
  const bySubjectId = new Map();
  rows.forEach((row) => {
    if (row.Subject && !bySubjectId.has(row.subjectId)) bySubjectId.set(row.subjectId, row.Subject);
  });
  return [...bySubjectId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The actual trend computation — no access check of its own, since its two
// callers need different ones: getStudentSubjectTrend below (teacher/admin
// scope, via assertScopeAccess) and parentPortal/service.js#
// getChildSubjectTrend (parent-owns-student, via assertParentOwnsStudent).
// Exported so parentPortal reuses this instead of duplicating the
// least-squares trend math.
async function computeStudentSubjectTrend(schoolId, { studentId, subjectId }) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
  const subject = await tenantScoped(Subject, schoolId).findByPk(subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');

  const gradingConfig = await resolveGradingConfig(schoolId);

  const scores = await tenantScoped(ExamScore, schoolId).findAll({
    where: { studentId, subjectId, status: 'CONFIRMED' },
    include: [
      { model: Term, include: [AcademicYear] },
      { model: Class, include: [Level] },
    ],
  });

  const history = scores
    .filter((score) => score.Term && score.Term.AcademicYear)
    .sort((a, b) => {
      const yearDiff = new Date(a.Term.AcademicYear.startDate) - new Date(b.Term.AcademicYear.startDate);
      return yearDiff !== 0 ? yearDiff : a.Term.sequence - b.Term.sequence;
    })
    .map((score) => {
      const totalScore = Number(score.totalScore);
      return {
        termId: score.termId,
        termName: score.Term.name,
        academicYearName: score.Term.AcademicYear.name,
        label: `${score.Term.AcademicYear.name} ${score.Term.name}`,
        totalScore,
        grade: resolveGrade(totalScore, gradingConfig.gradeBands).grade,
        classLabel: score.Class ? [score.Class.Level?.name, score.Class.name].filter(Boolean).join(' — ') : null,
        confirmedAt: score.confirmedAt,
      };
    });

  // Least-squares slope of score against term index — a steadier "is this
  // trending up or down" signal than just comparing the first and last
  // term, which one unusually good/bad term could flip on its own.
  let trendDirection = 'INSUFFICIENT_DATA';
  let slope = null;
  if (history.length >= 2) {
    const n = history.length;
    const meanX = (n - 1) / 2;
    const meanY = history.reduce((sum, h) => sum + h.totalScore, 0) / n;
    let numerator = 0;
    let denominator = 0;
    history.forEach((h, i) => {
      numerator += (i - meanX) * (h.totalScore - meanY);
      denominator += (i - meanX) ** 2;
    });
    slope = denominator !== 0 ? numerator / denominator : 0;
    if (slope > 1) trendDirection = 'IMPROVING';
    else if (slope < -1) trendDirection = 'DECLINING';
    else trendDirection = 'STABLE';
  }

  return {
    student: { id: student.id, fullName: student.fullName, studentNumber: student.studentNumber },
    subject: { id: subject.id, name: subject.name },
    history,
    summary: {
      count: history.length,
      averageScore: history.length > 0
        ? Math.round((history.reduce((sum, h) => sum + h.totalScore, 0) / history.length) * 10) / 10
        : 0,
      highest: history.length > 0 ? Math.max(...history.map((h) => h.totalScore)) : null,
      lowest: history.length > 0 ? Math.min(...history.map((h) => h.totalScore)) : null,
      first: history.length > 0 ? history[0].totalScore : null,
      latest: history.length > 0 ? history[history.length - 1].totalScore : null,
      change: history.length > 1
        ? Math.round((history[history.length - 1].totalScore - history[0].totalScore) * 10) / 10
        : null,
      trendDirection,
      slope: slope !== null ? Math.round(slope * 100) / 100 : null,
    },
  };
}

// Teacher/admin-facing entry point — `classId` is used only for the scope
// check (same convention as getExamGrid), a plain TEACHER must currently
// teach this class+subject pairing to view it, even though the trend data
// itself (computeStudentSubjectTrend above) spans every class the student
// has ever been in.
async function getStudentSubjectTrend(schoolId, userId, roles, { studentId, subjectId, classId }) {
  await assertScopeAccess(schoolId, { userId, roles, classId, subjectId });
  return computeStudentSubjectTrend(schoolId, { studentId, subjectId });
}

module.exports = {
  getMyAssignments,
  getAssessmentGrid,
  createAssessmentItem,
  updateAssessmentItem,
  deleteAssessmentItem,
  upsertScore,
  getExamGrid,
  saveExamScore,
  updateExamScoreEffort,
  confirmExamScores,
  reopenExamScores,
  getExamAnalytics,
  getMyExamAnalytics,
  getStudentSubjectTrend,
  // Exported for parentPortal/service.js — see the file-level comments on
  // each for why the access check and the computation are split.
  computeStudentSubjectTrend,
  getStudentSubjects,
  // Exported for students/fullHistory.js's cross-subject aggregation, which
  // needs the same grade-band lookup this module already uses internally.
  resolveGrade,
};
