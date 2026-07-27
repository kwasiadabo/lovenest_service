const {
  sequelize, FeeType, FeeAmount, AcademicYear, Term, Level, Class,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

async function listFeeTypes(schoolId) {
  return tenantScoped(FeeType, schoolId).findAll({ order: [['category', 'ASC'], ['name', 'ASC']] });
}

async function createFeeType(schoolId, { name, category }) {
  return tenantScoped(FeeType, schoolId).create({ name, category: category || 'OTHER' });
}

async function updateFeeType(schoolId, feeTypeId, { name, category }) {
  const feeType = await tenantScoped(FeeType, schoolId).findByPk(feeTypeId);
  if (!feeType) throw new ApiError(404, 'Fee type not found');

  await feeType.update({ name, category });
  return feeType;
}

// Removing a fee item also removes every amount set for it — there's no
// use for a FeeAmount row whose FeeType no longer exists, and the FK
// (NO ACTION, matching this codebase's cascade convention) would otherwise
// block the delete outright.
async function deleteFeeType(schoolId, feeTypeId) {
  await sequelize.transaction(async (transaction) => {
    await tenantScoped(FeeAmount, schoolId).destroy({ where: { feeTypeId }, transaction });
    const deleted = await tenantScoped(FeeType, schoolId).destroy({ where: { id: feeTypeId }, transaction });
    if (!deleted) throw new ApiError(404, 'Fee type not found');
  });
}

async function listFeeAmounts(schoolId, { academicYearId, termId, levelId, feeTypeId, classId } = {}) {
  const where = {};
  if (academicYearId) where.academicYearId = academicYearId;
  if (termId) where.termId = termId;
  if (levelId) where.levelId = levelId;
  if (feeTypeId) where.feeTypeId = feeTypeId;
  if (classId) where.classId = classId;
  return tenantScoped(FeeAmount, schoolId).findAll({ where });
}

// Admission fees are set once per academic year (no term), every other
// category is termly — the fee type's category decides which applies, so
// any termId the client sends for an ADMISSION item is ignored rather than
// trusted. classId is an optional override on top of the level's default;
// unset it (null) to mean "level default" rather than "no data".
async function setFeeAmount(schoolId, {
  academicYearId, termId, levelId, classId, feeTypeId, amountPesewas,
}) {
  const feeType = await tenantScoped(FeeType, schoolId).findByPk(feeTypeId);
  if (!feeType) throw new ApiError(404, 'Fee type not found');

  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  const level = await tenantScoped(Level, schoolId).findByPk(levelId);
  if (!level) throw new ApiError(404, 'Level not found');

  let effectiveTermId = null;
  if (feeType.category !== 'ADMISSION') {
    if (!termId) throw new ApiError(400, 'termId is required for this fee category');
    const term = await tenantScoped(Term, schoolId).findByPk(termId);
    if (!term) throw new ApiError(404, 'Term not found');
    if (term.academicYearId !== academicYearId) {
      throw new ApiError(400, 'That term does not belong to the selected academic year');
    }
    effectiveTermId = termId;
  }

  let effectiveClassId = null;
  if (classId) {
    const klass = await tenantScoped(Class, schoolId).findByPk(classId);
    if (!klass) throw new ApiError(404, 'Class not found');
    if (klass.levelId !== levelId) {
      throw new ApiError(400, 'That class does not belong to the selected level');
    }
    effectiveClassId = classId;
  }

  const existing = await tenantScoped(FeeAmount, schoolId).findOne({
    where: {
      academicYearId, termId: effectiveTermId, levelId, feeTypeId, classId: effectiveClassId,
    },
  });
  if (existing) {
    existing.amountPesewas = amountPesewas;
    await existing.save();
    return existing;
  }
  return tenantScoped(FeeAmount, schoolId).create({
    academicYearId, termId: effectiveTermId, levelId, classId: effectiveClassId, feeTypeId, amountPesewas,
  });
}

async function deleteFeeAmount(schoolId, feeAmountId) {
  const deleted = await tenantScoped(FeeAmount, schoolId).destroy({ where: { id: feeAmountId } });
  if (!deleted) throw new ApiError(404, 'Fee amount not found');
}

module.exports = {
  listFeeTypes,
  createFeeType,
  updateFeeType,
  deleteFeeType,
  listFeeAmounts,
  setFeeAmount,
  deleteFeeAmount,
};
