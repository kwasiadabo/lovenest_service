const { sequelize, AcademicYear, Term, Level, Class, Staff, FeeAmount } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

// ---- Academic Years ----

async function listAcademicYears(schoolId) {
  return tenantScoped(AcademicYear, schoolId).findAll({
    include: [Term],
    order: [['startDate', 'DESC']],
  });
}

async function createAcademicYear(schoolId, { name, startDate, endDate, isCurrent }) {
  return sequelize.transaction(async (t) => {
    if (isCurrent) {
      await AcademicYear.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    }
    return AcademicYear.create(
      { schoolId, name, startDate, endDate, isCurrent: !!isCurrent },
      { transaction: t },
    );
  });
}

async function updateAcademicYear(schoolId, academicYearId, data) {
  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  return sequelize.transaction(async (t) => {
    if (data.isCurrent) {
      await AcademicYear.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    }
    await year.update(data, { transaction: t });
    return year;
  });
}

async function setCurrentAcademicYear(schoolId, academicYearId) {
  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  return sequelize.transaction(async (t) => {
    await AcademicYear.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    year.isCurrent = true;
    await year.save({ transaction: t });
    return year;
  });
}

// ---- Terms ----

async function listTerms(schoolId, academicYearId) {
  return tenantScoped(Term, schoolId).findAll({
    where: academicYearId ? { academicYearId } : undefined,
    order: [['sequence', 'ASC']],
  });
}

async function createTerm(schoolId, academicYearId, { name, sequence, startDate, endDate, isCurrent }) {
  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  return sequelize.transaction(async (t) => {
    if (isCurrent) {
      await Term.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    }
    return Term.create(
      { schoolId, academicYearId, name, sequence, startDate, endDate, isCurrent: !!isCurrent },
      { transaction: t },
    );
  });
}

async function updateTerm(schoolId, termId, data) {
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  return sequelize.transaction(async (t) => {
    if (data.isCurrent) {
      await Term.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    }
    await term.update(data, { transaction: t });
    return term;
  });
}

async function setCurrentTerm(schoolId, termId) {
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  return sequelize.transaction(async (t) => {
    await Term.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    term.isCurrent = true;
    await term.save({ transaction: t });
    return term;
  });
}

// ---- Levels ----
// Levels are fixed (Pre-school 1, Pre-school 2, Lower Primary, Upper
// Primary, JHS), seeded once per school at creation time — see
// utils/defaultLevels.js.
// No create/update/delete: they're reference data, not admin-editable.

async function listLevels(schoolId) {
  return tenantScoped(Level, schoolId).findAll({ order: [['sequenceOrder', 'ASC']] });
}

// ---- Classes ----

async function listClasses(schoolId, levelId) {
  return tenantScoped(Class, schoolId).findAll({
    where: levelId ? { levelId } : undefined,
    include: [Level, { model: Staff, as: 'classTeachers', through: { attributes: [] } }, { model: Class, as: 'nextClass' }],
    order: [['name', 'ASC']],
  });
}

async function createClass(schoolId, { name, levelId }) {
  const level = await tenantScoped(Level, schoolId).findByPk(levelId);
  if (!level) throw new ApiError(404, 'Level not found');

  return tenantScoped(Class, schoolId).create({ name, levelId });
}

async function updateClass(schoolId, classId, data) {
  const klass = await tenantScoped(Class, schoolId).findByPk(classId);
  if (!klass) throw new ApiError(404, 'Class not found');

  if (data.levelId) {
    const level = await tenantScoped(Level, schoolId).findByPk(data.levelId);
    if (!level) throw new ApiError(404, 'Level not found');
  }

  if (data.nextClassId) {
    const nextClass = await tenantScoped(Class, schoolId).findByPk(data.nextClassId);
    if (!nextClass) throw new ApiError(404, 'Target class not found');
  }

  // Setting one promotion-mapping field clears the other — a class marked
  // as graduating can't also carry a stale nextClassId, and vice versa
  // (validators.js#validateClassPromotionMapping already rejects setting
  // both at once; this handles switching from one to the other).
  if (data.isGraduatingClass) data.nextClassId = null;
  else if (data.nextClassId) data.isGraduatingClass = false;

  await klass.update(data);
  return klass;
}

// A class can have per-class fee-amount overrides (FeeAmount.classId); those
// have no use once the class is gone, and the FK (NO ACTION) would
// otherwise block the delete outright. Same for any other class's
// nextClassId pointing here — cleared rather than blocking the delete (see
// migration 20260101000086's note on why this is NO ACTION, not SET NULL).
async function deleteClass(schoolId, classId) {
  await sequelize.transaction(async (transaction) => {
    await tenantScoped(FeeAmount, schoolId).destroy({ where: { classId }, transaction });
    await tenantScoped(Class, schoolId).update({ nextClassId: null }, { where: { nextClassId: classId }, transaction });
    const deleted = await tenantScoped(Class, schoolId).destroy({ where: { id: classId }, transaction });
    if (!deleted) throw new ApiError(404, 'Class not found');
  });
}

module.exports = {
  listAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
  listTerms,
  createTerm,
  updateTerm,
  setCurrentTerm,
  listLevels,
  listClasses,
  createClass,
  updateClass,
  deleteClass,
};
