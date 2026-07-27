const { sequelize, School, GradeBand } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

// Applied whenever a school hasn't customized its grading scale yet — never
// persisted on the school's behalf (see plan Phase 0: "do not eagerly seed").
const DEFAULT_GRADE_BANDS = [
  { minScore: 0, maxScore: 39, grade: 'E', remark: 'Emerging' },
  { minScore: 40, maxScore: 49, grade: 'D', remark: 'Developing' },
  { minScore: 50, maxScore: 59, grade: 'C', remark: 'Pass' },
  { minScore: 60, maxScore: 69, grade: 'B', remark: 'Average' },
  { minScore: 70, maxScore: 79, grade: 'B+', remark: 'Good' },
  { minScore: 80, maxScore: 89, grade: 'A', remark: 'Very Good' },
  { minScore: 90, maxScore: 100, grade: 'A+', remark: 'Excellent' },
].map((band, index) => ({ ...band, sortOrder: index }));

// School is the tenant root itself (its own id IS the schoolId) — it has no
// schoolId column to filter by, so it's queried directly, never through
// tenantScoped (same convention as schoolSettings/service.js).
async function getSchool(schoolId) {
  const school = await School.findByPk(schoolId);
  if (!school) throw new ApiError(404, 'School not found');
  return school;
}

// Single source of truth for the current CA/exam weighting and grade scale —
// imported by assessment/service.js and reportCards/service.js so the
// "unconfigured yet, fall back to defaults" logic lives in exactly one place.
async function resolveGradingConfig(schoolId) {
  const school = await getSchool(schoolId);
  const savedBands = await tenantScoped(GradeBand, schoolId).findAll({
    order: [['sortOrder', 'ASC']],
  });

  return {
    caWeight: Number(school.caWeight),
    examWeight: Number(school.examWeight),
    classworkSourceMode: school.classworkSourceMode,
    classworkWeight: Number(school.classworkWeight),
    projectWeight: Number(school.projectWeight),
    gradeBands: (savedBands.length > 0 ? savedBands : DEFAULT_GRADE_BANDS).map((band) => ({
      minScore: band.minScore,
      maxScore: band.maxScore,
      grade: band.grade,
      remark: band.remark,
    })),
  };
}

// Shared by updateWeights and updateClassworkSource — both are "two
// percentages that must sum to 100%" pairs, just against different column
// names and error-message labels.
function assertValidWeightPair(a, b, labelA, labelB) {
  if (Number.isNaN(a) || a <= 0 || a >= 1) {
    throw new ApiError(400, `${labelA} must be a number between 0 and 1`);
  }
  if (Number.isNaN(b) || b <= 0 || b >= 1) {
    throw new ApiError(400, `${labelB} must be a number between 0 and 1`);
  }
  if (Math.abs(a + b - 1) > 0.001) {
    throw new ApiError(400, `${labelA} and ${labelB} must sum to 1`);
  }
}

async function updateWeights(schoolId, { caWeight, examWeight }) {
  const ca = Number(caWeight);
  const exam = Number(examWeight);
  assertValidWeightPair(ca, exam, 'caWeight', 'examWeight');

  const school = await getSchool(schoolId);
  await school.update({ caWeight: ca, examWeight: exam });
  return { caWeight: ca, examWeight: exam };
}

const CLASSWORK_SOURCE_MODES = ['MANUAL', 'COMPUTED'];

async function updateClassworkSource(schoolId, { classworkSourceMode, classworkWeight, projectWeight }) {
  if (!CLASSWORK_SOURCE_MODES.includes(classworkSourceMode)) {
    throw new ApiError(400, `classworkSourceMode must be one of: ${CLASSWORK_SOURCE_MODES.join(', ')}`);
  }
  const classwork = Number(classworkWeight);
  const project = Number(projectWeight);
  // Validated regardless of mode (not just when COMPUTED) so the weights are
  // always in a valid state if a school later flips back to COMPUTED.
  assertValidWeightPair(classwork, project, 'classworkWeight', 'projectWeight');

  const school = await getSchool(schoolId);
  await school.update({
    classworkSourceMode, classworkWeight: classwork, projectWeight: project,
  });
  return { classworkSourceMode, classworkWeight: classwork, projectWeight: project };
}

function validateBands(bands) {
  if (!Array.isArray(bands) || bands.length === 0) {
    throw new ApiError(400, 'bands must be a non-empty array');
  }

  const sorted = [...bands].sort((a, b) => Number(a.minScore) - Number(b.minScore));
  for (let i = 0; i < sorted.length; i += 1) {
    const band = sorted[i];
    const min = Number(band.minScore);
    const max = Number(band.maxScore);
    if (!band.grade || typeof band.grade !== 'string' || !band.grade.trim()) {
      throw new ApiError(400, 'Every band must have a grade label');
    }
    if (!band.remark || typeof band.remark !== 'string' || !band.remark.trim()) {
      throw new ApiError(400, 'Every band must have a remark');
    }
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max > 100 || min > max) {
      throw new ApiError(400, 'Each band must have 0 <= minScore <= maxScore <= 100');
    }
    if (i === 0 && min !== 0) {
      throw new ApiError(400, 'The lowest band must start at 0');
    }
    if (i === sorted.length - 1 && max !== 100) {
      throw new ApiError(400, 'The highest band must end at 100');
    }
    if (i > 0 && min !== Number(sorted[i - 1].maxScore) + 1) {
      throw new ApiError(400, 'Bands must be contiguous with no gaps or overlaps');
    }
  }
  return sorted;
}

async function updateGradeBands(schoolId, bands) {
  const sorted = validateBands(bands);

  return sequelize.transaction(async (transaction) => {
    await tenantScoped(GradeBand, schoolId).destroy({ where: {}, transaction });
    const created = await tenantScoped(GradeBand, schoolId).bulkCreate(
      sorted.map((band, index) => ({
        minScore: Number(band.minScore),
        maxScore: Number(band.maxScore),
        grade: band.grade.trim(),
        remark: band.remark.trim(),
        sortOrder: index,
      })),
      { transaction },
    );
    return created;
  });
}

module.exports = {
  DEFAULT_GRADE_BANDS,
  resolveGradingConfig,
  updateWeights,
  updateClassworkSource,
  updateGradeBands,
};
