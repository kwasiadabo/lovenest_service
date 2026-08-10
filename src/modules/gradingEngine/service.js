const { randomUUID } = require('crypto');
const {
  sequelize, GradingScheme, PerformanceLevel, ResultCalculation, ReferencePopulation,
  RankingResult, PercentileResult, StanineResult, Class, Term, ExamScore, Staff,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const { resolveRoster } = require('../../utils/classRoster');
const ApiError = require('../../utils/ApiError');

// Same "resolve the acting Staff row from the authenticated User id" pattern
// as assessment/service.js — null when the caller has no Staff row (e.g. a
// SCHOOL_ADMIN with no teaching profile), which createdByStaffId/
// triggeredByStaffId both tolerate.
async function resolveStaffId(schoolId, userId) {
  if (!userId) return null;
  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  return staffMember ? staffMember.id : null;
}

// ---------------------------------------------------------------------------
// Grading Scheme CRUD
//
// A scheme is a versioned config bundle for the NEW relative-performance
// capabilities (Ranking/Percentile/Stanine + independent Performance
// Levels) — it does not touch CA/Exam weighting or the letter-grade scale,
// which stay governed by gradingSettings/service.js#resolveGradingConfig.
// ---------------------------------------------------------------------------

const RANKING_METHODS = ['COMPETITION', 'DENSE', 'AVERAGE'];
const REFERENCE_SCOPES = ['CLASS', 'STREAM', 'YEAR_GROUP', 'SCHOOL', 'ACADEMIC_LEVEL', 'CUSTOM_COHORT'];
// STREAM/CUSTOM_COHORT are schema-ready (see migration/model comments) but
// have no data source yet — Class has no "stream" concept today, and a
// custom cohort needs an explicit student list nothing currently collects.
const SUPPORTED_REFERENCE_SCOPES = ['CLASS', 'ACADEMIC_LEVEL', 'YEAR_GROUP', 'SCHOOL'];

async function getSchemeOrThrow(schoolId, schemeId) {
  const scheme = await tenantScoped(GradingScheme, schoolId).findByPk(schemeId, {
    include: [{ model: PerformanceLevel, as: 'performanceLevels' }],
  });
  if (!scheme) throw new ApiError(404, 'Grading scheme not found');
  return scheme;
}

function assertValidSchemeConfig(input) {
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    throw new ApiError(400, 'name is required');
  }
  if (input.rankingMethod && !RANKING_METHODS.includes(input.rankingMethod)) {
    throw new ApiError(400, `rankingMethod must be one of: ${RANKING_METHODS.join(', ')}`);
  }
  if (input.stanineDefaultReferenceScope && !REFERENCE_SCOPES.includes(input.stanineDefaultReferenceScope)) {
    throw new ApiError(400, `stanineDefaultReferenceScope must be one of: ${REFERENCE_SCOPES.join(', ')}`);
  }
  if (input.stanineMinPopulation !== undefined) {
    const value = Number(input.stanineMinPopulation);
    if (!Number.isInteger(value) || value < 1) {
      throw new ApiError(400, 'stanineMinPopulation must be a positive whole number');
    }
  }
}

async function listGradingSchemes(schoolId, { academicLevelId } = {}) {
  const where = {};
  if (academicLevelId !== undefined) where.academicLevelId = academicLevelId;
  return tenantScoped(GradingScheme, schoolId).findAll({
    where, order: [['createdAt', 'DESC']],
  });
}

async function createGradingScheme(schoolId, input, userId) {
  assertValidSchemeConfig(input);
  const createdByStaffId = await resolveStaffId(schoolId, userId);

  return tenantScoped(GradingScheme, schoolId).create({
    name: input.name.trim(),
    academicLevelId: input.academicLevelId || null,
    version: 1,
    status: 'DRAFT',
    supersedesSchemeId: input.supersedesSchemeId || null,
    effectiveAcademicYearId: input.effectiveAcademicYearId || null,
    rankingEnabled: input.rankingEnabled !== undefined ? !!input.rankingEnabled : true,
    rankingMethod: input.rankingMethod || 'COMPETITION',
    percentileEnabled: input.percentileEnabled !== undefined ? !!input.percentileEnabled : true,
    stanineEnabled: input.stanineEnabled !== undefined ? !!input.stanineEnabled : false,
    stanineMinPopulation: input.stanineMinPopulation !== undefined ? Number(input.stanineMinPopulation) : 30,
    stanineDefaultReferenceScope: input.stanineDefaultReferenceScope || 'YEAR_GROUP',
    showPositionOnReportCard: input.showPositionOnReportCard !== undefined ? !!input.showPositionOnReportCard : true,
    showPercentileOnReportCard: !!input.showPercentileOnReportCard,
    showStanineOnReportCard: !!input.showStanineOnReportCard,
    createdByStaffId: createdByStaffId || null,
  });
}

async function updateGradingScheme(schoolId, schemeId, input) {
  const scheme = await getSchemeOrThrow(schoolId, schemeId);
  if (scheme.status !== 'DRAFT') {
    throw new ApiError(409, 'Only a DRAFT scheme can be edited — create a new version instead.');
  }
  assertValidSchemeConfig({ name: input.name ?? scheme.name, ...input });

  const patch = {};
  const editableFields = [
    'name', 'academicLevelId', 'effectiveAcademicYearId', 'rankingEnabled', 'rankingMethod',
    'percentileEnabled', 'stanineEnabled', 'stanineMinPopulation', 'stanineDefaultReferenceScope',
    'showPositionOnReportCard', 'showPercentileOnReportCard', 'showStanineOnReportCard',
  ];
  editableFields.forEach((field) => {
    if (input[field] !== undefined) patch[field] = input[field];
  });
  if (patch.name) patch.name = patch.name.trim();

  await scheme.update(patch);
  return scheme;
}

// Activating archives whatever scheme was previously ACTIVE for the same
// (schoolId, academicLevelId) pair — only one ACTIVE scheme per level (or
// per "applies to all levels", when academicLevelId is null) at a time, so
// resolveActiveSchemeForLevel below never has to pick between two.
async function activateGradingScheme(schoolId, schemeId) {
  const scheme = await getSchemeOrThrow(schoolId, schemeId);
  if (scheme.status === 'ACTIVE') return scheme;
  if (scheme.status === 'ARCHIVED') {
    throw new ApiError(409, 'An archived scheme cannot be reactivated — create a new version instead.');
  }

  return sequelize.transaction(async (transaction) => {
    const previousActive = await tenantScoped(GradingScheme, schoolId).findOne({
      where: { academicLevelId: scheme.academicLevelId, status: 'ACTIVE' },
      transaction,
    });

    let version = 1;
    if (scheme.supersedesSchemeId) {
      const superseded = await tenantScoped(GradingScheme, schoolId).findByPk(scheme.supersedesSchemeId, { transaction });
      version = superseded ? superseded.version + 1 : 1;
    } else if (previousActive) {
      version = previousActive.version + 1;
    }

    if (previousActive) {
      await previousActive.update({ status: 'ARCHIVED' }, { transaction });
    }
    await scheme.update({ status: 'ACTIVE', version }, { transaction });
    return scheme;
  });
}

// Same contiguous-0-to-100 validation spirit as gradingSettings/service.js's
// validateBands, reused conceptually (not imported — this module keeps its
// own copy, matching the codebase's convention of duplicating small
// validation helpers rather than cross-importing between modules).
function validatePerformanceLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new ApiError(400, 'levels must be a non-empty array');
  }
  const sorted = [...levels].sort((a, b) => Number(a.minScore) - Number(b.minScore));
  for (let i = 0; i < sorted.length; i += 1) {
    const level = sorted[i];
    const min = Number(level.minScore);
    const max = Number(level.maxScore);
    if (!level.label || typeof level.label !== 'string' || !level.label.trim()) {
      throw new ApiError(400, 'Every performance level must have a label');
    }
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max > 100 || min > max) {
      throw new ApiError(400, 'Each performance level must have 0 <= minScore <= maxScore <= 100');
    }
    if (i === 0 && min !== 0) throw new ApiError(400, 'The lowest performance level must start at 0');
    if (i === sorted.length - 1 && max !== 100) throw new ApiError(400, 'The highest performance level must end at 100');
    if (i > 0 && min !== Number(sorted[i - 1].maxScore) + 1) {
      throw new ApiError(400, 'Performance levels must be contiguous with no gaps or overlaps');
    }
  }
  return sorted;
}

async function updatePerformanceLevels(schoolId, schemeId, levels) {
  const scheme = await getSchemeOrThrow(schoolId, schemeId);
  if (scheme.status !== 'DRAFT') {
    throw new ApiError(409, 'Performance levels can only be edited while the scheme is DRAFT.');
  }
  const sorted = validatePerformanceLevels(levels);

  return sequelize.transaction(async (transaction) => {
    await tenantScoped(PerformanceLevel, schoolId).destroy({ where: { gradingSchemeId: schemeId }, transaction });
    return tenantScoped(PerformanceLevel, schoolId).bulkCreate(
      sorted.map((level, index) => ({
        gradingSchemeId: schemeId,
        minScore: Number(level.minScore),
        maxScore: Number(level.maxScore),
        label: level.label.trim(),
        sortOrder: index,
      })),
      { transaction },
    );
  });
}

function resolvePerformanceLevel(score, levels) {
  if (!levels || levels.length === 0) return null;
  const sorted = [...levels].sort((a, b) => a.minScore - b.minScore);
  let matched = null;
  for (const level of sorted) {
    if (score >= level.minScore) matched = level;
  }
  return matched ? matched.label : null;
}

// The single lookup the calculation engine (and, later, report cards) uses
// to find which scheme governs a given level — mirrors
// gradingSettings/service.js#resolveGradingConfig's role for CA/Exam.
async function resolveActiveSchemeForLevel(schoolId, levelId) {
  const scoped = tenantScoped(GradingScheme, schoolId);
  if (levelId) {
    const levelScheme = await scoped.findOne({
      where: { academicLevelId: levelId, status: 'ACTIVE' },
      include: [{ model: PerformanceLevel, as: 'performanceLevels' }],
    });
    if (levelScheme) return levelScheme;
  }
  return scoped.findOne({
    where: { academicLevelId: null, status: 'ACTIVE' },
    include: [{ model: PerformanceLevel, as: 'performanceLevels' }],
  });
}

// ---------------------------------------------------------------------------
// Statistical core — pure functions, no DB access, so the Ranking/Percentile
// /Stanine math can be tested in isolation from data-fetching.
// ---------------------------------------------------------------------------

// Fixed normal-distribution stanine bands (4/7/12/17/20/17/12/7/4 % of the
// population) — a percentile is mapped into a stanine by where it falls in
// this table. Deliberately NOT keyed to raw percentage-of-marks thresholds
// (e.g. "90% = 9"): Stanine is norm-referenced, relative to the population,
// never an absolute achievement measure.
const STANINE_PERCENTILE_BANDS = [
  { stanine: 1, maxPercentile: 3.9 },
  { stanine: 2, maxPercentile: 10.9 },
  { stanine: 3, maxPercentile: 22.9 },
  { stanine: 4, maxPercentile: 39.9 },
  { stanine: 5, maxPercentile: 59.9 },
  { stanine: 6, maxPercentile: 76.9 },
  { stanine: 7, maxPercentile: 88.9 },
  { stanine: 8, maxPercentile: 95.9 },
  { stanine: 9, maxPercentile: 100 },
];

function percentileToStanine(percentile) {
  const band = STANINE_PERCENTILE_BANDS.find((b) => percentile <= b.maxPercentile);
  return band ? band.stanine : 9;
}

// Mean/mid-rank percentile: (countBelow + 0.5*countEqual) / N * 100. Not the
// same number as raw percentage — two students who both scored 78% can land
// on different percentiles depending on the rest of the cohort.
function computePercentile(score, allScores) {
  const countBelow = allScores.filter((s) => s < score).length;
  const countEqual = allScores.filter((s) => s === score).length;
  return ((countBelow + 0.5 * countEqual) / allScores.length) * 100;
}

// Population (not sample) standard deviation — the reference population IS
// the whole population being described, not a sample estimating a larger one.
function computeMeanStdDev(scores) {
  const n = scores.length;
  const mean = scores.reduce((sum, s) => sum + s, 0) / n;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / n;
  return { mean, stdDev: Math.sqrt(variance) };
}

// entries: [{ studentId, score }]. Ties share a position; the next distinct
// score's position depends on method:
//   COMPETITION (default, matches today's report-card ranking): 1, 1, 3
//   DENSE:                                                      1, 1, 2
//   AVERAGE: each tied student gets the mean of their rank range (e.g. two
//     students tied for 2nd/3rd both get 2.5, rounded to 3 for the integer
//     `position` column; the exact value is kept in `positionDecimal`).
function rankStudents(entries, method = 'COMPETITION') {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const n = sorted.length;
  const results = [];
  let index = 0;
  let densePosition = 0;

  while (index < n) {
    let end = index;
    while (end + 1 < n && sorted[end + 1].score === sorted[index].score) end += 1;
    const tieGroupSize = end - index + 1;
    const competitionPosition = index + 1;
    const averagePosition = (index + 1 + end + 1) / 2;
    densePosition += 1;

    for (let k = index; k <= end; k += 1) {
      let position = competitionPosition;
      let positionDecimal = null;
      if (method === 'DENSE') {
        position = densePosition;
      } else if (method === 'AVERAGE') {
        position = Math.round(averagePosition);
        positionDecimal = averagePosition;
      }
      results.push({
        studentId: sorted[k].studentId, score: sorted[k].score, position, positionDecimal, tieGroupSize,
      });
    }
    index = end + 1;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Result Calculation — the orchestrated, audited run that reads ExamScore
// and writes ReferencePopulation/RankingResult/PercentileResult/
// StanineResult, all tied to one ResultCalculation batch.
// ---------------------------------------------------------------------------

async function resolveClassesInScope(schoolId, scopeType, scopeRefId) {
  const scopedClass = tenantScoped(Class, schoolId);
  if (scopeType === 'CLASS') {
    if (!scopeRefId) throw new ApiError(400, 'scopeRefId (classId) is required for CLASS scope');
    const klass = await scopedClass.findByPk(scopeRefId);
    if (!klass) throw new ApiError(404, 'Class not found');
    return [klass];
  }
  if (scopeType === 'ACADEMIC_LEVEL') {
    if (!scopeRefId) throw new ApiError(400, 'scopeRefId (academicLevelId) is required for ACADEMIC_LEVEL scope');
    return scopedClass.findAll({ where: { levelId: scopeRefId } });
  }
  if (scopeType === 'SCHOOL') {
    return scopedClass.findAll();
  }
  throw new ApiError(400, `scopeType '${scopeType}' is not yet supported for calculation — use CLASS, ACADEMIC_LEVEL, or SCHOOL`);
}

// The cohort a student's percentile/Stanine is measured against — can be
// broader than the classes actually being recalculated (e.g. recalculating
// one class against its whole year group). CLASS scope is resolved
// per-class by the caller, since it means "compare only within one's own
// class" rather than one shared cohort for the whole run.
async function resolveReferenceCohortClasses(schoolId, scheme, fallbackLevelId) {
  const scope = scheme.stanineDefaultReferenceScope;
  if (!SUPPORTED_REFERENCE_SCOPES.includes(scope)) {
    throw new ApiError(400, `Reference population scope '${scope}' is not yet supported (no data source for STREAM/CUSTOM_COHORT yet).`);
  }
  if (scope === 'ACADEMIC_LEVEL' || scope === 'YEAR_GROUP') {
    const levelId = scheme.academicLevelId || fallbackLevelId;
    return tenantScoped(Class, schoolId).findAll({ where: { levelId } });
  }
  if (scope === 'SCHOOL') {
    return tenantScoped(Class, schoolId).findAll();
  }
  return null; // CLASS — resolved per-class by the caller.
}

// Sums each student's CONFIRMED-only ExamScore.totalScore across every
// subject — the same "overall score" definition reportCards/service.js's
// getClassRanking already uses for whole-card position, kept as its own
// copy here rather than imported (see file-level convention note).
function buildScoreMaps(examRows) {
  const bySubject = new Map(); // subjectId -> Map<studentId, score>
  const overall = new Map(); // studentId -> summed score

  examRows.forEach((row) => {
    const score = Number(row.totalScore);
    if (!bySubject.has(row.subjectId)) bySubject.set(row.subjectId, new Map());
    bySubject.get(row.subjectId).set(row.studentId, score);
    overall.set(row.studentId, (overall.get(row.studentId) || 0) + score);
  });

  return { bySubject, overall };
}

async function runResultCalculation(schoolId, { termId, scopeType, scopeRefId }, { userId, triggerType = 'MANUAL' } = {}) {
  const staffId = await resolveStaffId(schoolId, userId);
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const classesInScope = await resolveClassesInScope(schoolId, scopeType, scopeRefId);
  if (classesInScope.length === 0) throw new ApiError(404, 'No classes found for this scope');

  // One run must be governed by exactly one scheme — if a SCHOOL/
  // ACADEMIC_LEVEL scope spans classes under different active schemes, the
  // caller should scope the run more narrowly (or configure a single
  // school-wide scheme). Keeps ResultCalculation's single gradingSchemeId
  // unambiguous rather than guessing which scheme "owns" a mixed run.
  const schemeByLevelId = new Map();
  for (const klass of classesInScope) {
    if (!schemeByLevelId.has(klass.levelId)) {
      // eslint-disable-next-line no-await-in-loop
      schemeByLevelId.set(klass.levelId, await resolveActiveSchemeForLevel(schoolId, klass.levelId));
    }
  }
  if ([...schemeByLevelId.values()].some((s) => !s)) {
    throw new ApiError(409, 'No active grading scheme is configured for one or more levels in this scope.');
  }
  const distinctSchemes = [...new Map([...schemeByLevelId.values()].map((s) => [s.id, s])).values()];
  if (distinctSchemes.length > 1) {
    throw new ApiError(409, 'This scope spans classes governed by more than one active grading scheme — scope the run per level instead.');
  }
  const scheme = distinctSchemes[0];

  const rosterByClass = new Map();
  for (const klass of classesInScope) {
    // eslint-disable-next-line no-await-in-loop
    rosterByClass.set(klass.id, await resolveRoster(schoolId, klass.id, termId));
  }
  const targetStudentIds = [...rosterByClass.values()].flat().map((s) => s.id);

  const calculation = await ResultCalculation.create({
    schoolId,
    gradingSchemeId: scheme.id,
    gradingSchemeVersion: scheme.version,
    academicYearId: term.academicYearId,
    termId,
    scopeType,
    scopeRefId: scopeRefId || null,
    triggerType,
    status: 'RUNNING',
    triggeredByStaffId: staffId || null,
    startedAt: new Date(),
  });

  try {
    const result = await sequelize.transaction(async (transaction) => {
      const referencePopulationIdBySubjectAndClass = new Map(); // key: `${subjectId||'OVERALL'}::${classId||'SHARED'}`
      const rankingRows = [];
      const percentileRows = [];
      const stanineRows = [];
      let referenceCohortClasses = null;
      if (scheme.stanineDefaultReferenceScope !== 'CLASS') {
        referenceCohortClasses = await resolveReferenceCohortClasses(schoolId, scheme, classesInScope[0].levelId);
      }

      // Reference cohort exam rows — resolved once per run when the
      // reference scope is shared (ACADEMIC_LEVEL/YEAR_GROUP/SCHOOL); when
      // CLASS-scoped, each class supplies its own cohort below instead.
      let sharedCohortScoreMaps = null;
      if (referenceCohortClasses) {
        const cohortClassIds = referenceCohortClasses.map((c) => c.id);
        const cohortRosters = await Promise.all(
          referenceCohortClasses.map((c) => resolveRoster(schoolId, c.id, termId)),
        );
        const cohortStudentIds = cohortRosters.flat().map((s) => s.id);
        const cohortExamRows = cohortStudentIds.length > 0
          ? await tenantScoped(ExamScore, schoolId).findAll({
            where: {
              classId: cohortClassIds, termId, studentId: cohortStudentIds, status: 'CONFIRMED',
            },
            transaction,
          })
          : [];
        sharedCohortScoreMaps = buildScoreMaps(cohortExamRows);
      }

      for (const klass of classesInScope) {
        const roster = rosterByClass.get(klass.id);
        const rosterIds = roster.map((s) => s.id);
        if (rosterIds.length === 0) continue; // eslint-disable-line no-continue

        // eslint-disable-next-line no-await-in-loop
        const classExamRows = await tenantScoped(ExamScore, schoolId).findAll({
          where: {
            classId: klass.id, termId, studentId: rosterIds, status: 'CONFIRMED',
          },
          transaction,
        });
        const classScoreMaps = buildScoreMaps(classExamRows);

        // --- Ranking: always computed at CLASS scope, per subject + overall.
        if (scheme.rankingEnabled) {
          const subjectIdsPresent = [...classScoreMaps.bySubject.keys()];
          for (const subjectId of [...subjectIdsPresent, null]) {
            const scoreMap = subjectId === null ? classScoreMaps.overall : classScoreMaps.bySubject.get(subjectId);
            const entries = rosterIds
              .filter((id) => scoreMap.has(id))
              .map((id) => ({ studentId: id, score: scoreMap.get(id) }));
            if (entries.length === 0) continue; // eslint-disable-line no-continue

            rankStudents(entries, scheme.rankingMethod).forEach((r) => {
              rankingRows.push({
                schoolId,
                resultCalculationId: calculation.id,
                studentId: r.studentId,
                subjectId,
                termId,
                scope: 'CLASS',
                scopeRefId: klass.id,
                rankingMethod: scheme.rankingMethod,
                position: r.position,
                positionDecimal: r.positionDecimal,
                tieGroupSize: r.tieGroupSize,
                populationSize: entries.length,
                rawScore: r.score,
              });
            });
          }
        }

        // --- Percentile / Stanine: measured against the reference cohort.
        if (scheme.percentileEnabled || scheme.stanineEnabled) {
          const cohortMaps = scheme.stanineDefaultReferenceScope === 'CLASS' ? classScoreMaps : sharedCohortScoreMaps;
          const cohortSubjectIds = [...cohortMaps.bySubject.keys()];

          for (const subjectId of [...cohortSubjectIds, null]) {
            const cohortScoreMap = subjectId === null ? cohortMaps.overall : cohortMaps.bySubject.get(subjectId);
            const cohortScores = [...cohortScoreMap.values()];
            if (cohortScores.length === 0) continue; // eslint-disable-line no-continue

            const popKey = `${subjectId || 'OVERALL'}::${scheme.stanineDefaultReferenceScope === 'CLASS' ? klass.id : 'SHARED'}`;
            let referencePopulationId = referencePopulationIdBySubjectAndClass.get(popKey);
            if (!referencePopulationId) {
              const { mean, stdDev } = computeMeanStdDev(cohortScores);
              referencePopulationId = randomUUID();
              referencePopulationIdBySubjectAndClass.set(popKey, referencePopulationId);
              // eslint-disable-next-line no-await-in-loop
              await ReferencePopulation.create({
                id: referencePopulationId,
                schoolId,
                resultCalculationId: calculation.id,
                scope: scheme.stanineDefaultReferenceScope,
                scopeRefId: scheme.stanineDefaultReferenceScope === 'CLASS' ? klass.id : (scheme.academicLevelId || null),
                subjectId,
                termId,
                populationSize: cohortScores.length,
                meanScore: mean,
                stdDevScore: stdDev,
              }, { transaction });
            }

            const studentScoreMap = subjectId === null ? classScoreMaps.overall : classScoreMaps.bySubject.get(subjectId);
            if (!studentScoreMap) continue; // eslint-disable-line no-continue

            rosterIds.forEach((studentId) => {
              if (!studentScoreMap.has(studentId)) return;
              const score = studentScoreMap.get(studentId);

              if (scheme.percentileEnabled) {
                percentileRows.push({
                  schoolId,
                  resultCalculationId: calculation.id,
                  referencePopulationId,
                  studentId,
                  subjectId,
                  termId,
                  percentile: computePercentile(score, cohortScores),
                  rawScore: score,
                });
              }

              if (scheme.stanineEnabled) {
                const insufficientPopulation = cohortScores.length < scheme.stanineMinPopulation;
                stanineRows.push({
                  schoolId,
                  resultCalculationId: calculation.id,
                  referencePopulationId,
                  studentId,
                  subjectId,
                  termId,
                  stanine: insufficientPopulation ? null : percentileToStanine(computePercentile(score, cohortScores)),
                  isInsufficientPopulation: insufficientPopulation,
                  minimumRequiredPopulation: scheme.stanineMinPopulation,
                  rawScore: score,
                });
              }
            });
          }
        }
      }

      if (rankingRows.length > 0) await RankingResult.bulkCreate(rankingRows, { transaction });
      if (percentileRows.length > 0) await PercentileResult.bulkCreate(percentileRows, { transaction });
      if (stanineRows.length > 0) await StanineResult.bulkCreate(stanineRows, { transaction });

      return { targetStudentIds };
    });

    await calculation.update({
      status: 'COMPLETED', completedAt: new Date(), studentsProcessed: new Set(result.targetStudentIds).size,
    });
    return calculation;
  } catch (err) {
    await calculation.update({
      status: 'FAILED', completedAt: new Date(), errorMessage: String(err.message || err).slice(0, 500),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reads — "latest" means the most recently written row for that
// student/subject/term (a recalculation simply writes a newer row via a new
// ResultCalculation; nothing is ever mutated in place, per the audit
// requirement), so ordering by createdAt DESC and taking the first is enough.
// ---------------------------------------------------------------------------

async function getStudentRanking(schoolId, studentId, { termId, subjectId, scope = 'CLASS' } = {}) {
  return tenantScoped(RankingResult, schoolId).findOne({
    where: {
      studentId, termId, subjectId: subjectId ?? null, scope,
    },
    order: [['createdAt', 'DESC']],
  });
}

async function getStudentPercentile(schoolId, studentId, { termId, subjectId } = {}) {
  return tenantScoped(PercentileResult, schoolId).findOne({
    where: { studentId, termId, subjectId: subjectId ?? null },
    order: [['createdAt', 'DESC']],
  });
}

async function getStudentStanine(schoolId, studentId, { termId, subjectId } = {}) {
  return tenantScoped(StanineResult, schoolId).findOne({
    where: { studentId, termId, subjectId: subjectId ?? null },
    order: [['createdAt', 'DESC']],
  });
}

// One student's full relative-performance picture for a term, in exactly
// two queries (not one per subject) — built for reportCards/service.js,
// which needs every subject's percentile/Stanine plus the overall figure in
// a single pass per student, not N+1 per-subject lookups. "Latest wins" per
// subjectId, same rule as the single-row getStudentPercentile/Stanine above.
async function getStudentRelativePerformance(schoolId, studentId, termId) {
  const [percentileRows, stanineRows] = await Promise.all([
    tenantScoped(PercentileResult, schoolId).findAll({
      where: { studentId, termId },
      order: [['createdAt', 'DESC']],
    }),
    tenantScoped(StanineResult, schoolId).findAll({
      where: { studentId, termId },
      order: [['createdAt', 'DESC']],
    }),
  ]);

  const percentileBySubject = new Map();
  let overallPercentile = null;
  percentileRows.forEach((row) => {
    const key = row.subjectId || 'OVERALL';
    if (percentileBySubject.has(key)) return;
    percentileBySubject.set(key, Number(row.percentile));
    if (!row.subjectId) overallPercentile = Number(row.percentile);
  });

  const stanineBySubject = new Map();
  let overallStanine = null;
  stanineRows.forEach((row) => {
    const key = row.subjectId || 'OVERALL';
    if (stanineBySubject.has(key)) return;
    stanineBySubject.set(key, row.stanine);
    if (!row.subjectId) overallStanine = row.stanine;
  });

  return {
    percentileBySubject, overallPercentile, stanineBySubject, overallStanine,
  };
}

// Distribution across a class's roster, using each student's latest Stanine
// row for the term/subject — powers a future "Stanine Distribution" chart
// without needing its own persisted aggregate.
async function getClassStanineDistribution(schoolId, classId, { termId, subjectId } = {}) {
  const roster = await resolveRoster(schoolId, classId, termId);
  const rosterIds = roster.map((s) => s.id);
  if (rosterIds.length === 0) return { distribution: {}, insufficientPopulationCount: 0, studentsWithoutResult: 0 };

  const rows = await tenantScoped(StanineResult, schoolId).findAll({
    where: { studentId: rosterIds, termId, subjectId: subjectId ?? null },
    order: [['createdAt', 'DESC']],
  });

  const latestByStudent = new Map();
  rows.forEach((row) => {
    if (!latestByStudent.has(row.studentId)) latestByStudent.set(row.studentId, row);
  });

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  let insufficientPopulationCount = 0;
  latestByStudent.forEach((row) => {
    if (row.stanine) distribution[row.stanine] += 1;
    else insufficientPopulationCount += 1;
  });

  return {
    distribution,
    insufficientPopulationCount,
    studentsWithoutResult: rosterIds.length - latestByStudent.size,
  };
}

module.exports = {
  // scheme CRUD
  listGradingSchemes,
  createGradingScheme,
  updateGradingScheme,
  activateGradingScheme,
  getSchemeOrThrow,
  updatePerformanceLevels,
  resolvePerformanceLevel,
  resolveActiveSchemeForLevel,
  // pure calculation helpers (exported for unit tests)
  percentileToStanine,
  computePercentile,
  computeMeanStdDev,
  rankStudents,
  // orchestration
  runResultCalculation,
  // reads
  getStudentRanking,
  getStudentPercentile,
  getStudentStanine,
  getStudentRelativePerformance,
  getClassStanineDistribution,
};
