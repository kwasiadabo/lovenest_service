const {
  sequelize, AcademicYear, Term, Level, Class, Staff, FeeAmount, CurrentPeriodChange, User,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { handleTermIndebtedness } = require('../billing/termBillingService');

const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

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

// Explicit field whitelist, not a raw `.update(req.body)` — schoolId is
// owned by tenantScoped's own enforcement; letting a caller set it directly
// here would let them reassign this academic year to another school.
async function updateAcademicYear(schoolId, academicYearId, {
  name, startDate, endDate, isCurrent,
}) {
  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  return sequelize.transaction(async (t) => {
    if (isCurrent) {
      await AcademicYear.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    }
    await year.update({
      name, startDate, endDate, isCurrent,
    }, { transaction: t });
    return year;
  });
}

async function setCurrentAcademicYear(schoolId, academicYearId, userId, reason) {
  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  let vacatedTerm = null;
  const result = await sequelize.transaction(async (t) => {
    const previous = await tenantScoped(AcademicYear, schoolId).findOne({
      where: { isCurrent: true }, transaction: t,
    });
    // The academic-year switch doesn't touch Term.isCurrent — whatever term
    // is current right now is the last term of the outgoing year, i.e. the
    // one billing/termBillingService.js needs to check for indebtedness.
    vacatedTerm = await tenantScoped(Term, schoolId).findOne({
      where: { isCurrent: true }, transaction: t,
    });

    await AcademicYear.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    year.isCurrent = true;
    await year.save({ transaction: t });

    await tenantScoped(CurrentPeriodChange, schoolId).create({
      entityType: 'ACADEMIC_YEAR',
      previousCurrentId: previous?.id ?? null,
      previousCurrentLabel: previous?.name ?? null,
      newCurrentId: year.id,
      newCurrentLabel: year.name,
      changedByUserId: userId,
      reason,
    }, { transaction: t });

    return year;
  });

  // Never blocks or throws back to the caller — a new academic year starts
  // regardless of indebtedness; this only notifies the admin/headmaster and
  // starts the 14-day grace clock if it isn't already running.
  try {
    await handleTermIndebtedness(schoolId, vacatedTerm);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[academic] term indebtedness check failed:', err);
  }

  return result;
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

// Same explicit-whitelist rationale as updateAcademicYear above — schoolId
// and academicYearId must never be settable via this path (the latter would
// let a caller move a term into a different academic year outside the
// dedicated create/promotion flows).
async function updateTerm(schoolId, termId, {
  name, sequence, startDate, endDate, isCurrent,
}) {
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  return sequelize.transaction(async (t) => {
    if (isCurrent) {
      await Term.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    }
    await term.update({
      name, sequence, startDate, endDate, isCurrent,
    }, { transaction: t });
    return term;
  });
}

async function setCurrentTerm(schoolId, termId, userId, reason) {
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  let vacatedTerm = null;
  const result = await sequelize.transaction(async (t) => {
    vacatedTerm = await tenantScoped(Term, schoolId).findOne({
      where: { isCurrent: true }, transaction: t,
    });

    await Term.update({ isCurrent: false }, { where: { schoolId }, transaction: t });
    term.isCurrent = true;
    await term.save({ transaction: t });

    await tenantScoped(CurrentPeriodChange, schoolId).create({
      entityType: 'TERM',
      previousCurrentId: vacatedTerm?.id ?? null,
      previousCurrentLabel: vacatedTerm?.name ?? null,
      newCurrentId: term.id,
      newCurrentLabel: term.name,
      changedByUserId: userId,
      reason,
    }, { transaction: t });

    return term;
  });

  // Never blocks or throws back to the caller — the transition always
  // succeeds; this only notifies the admin/headmaster and starts the
  // 14-day grace clock if the vacated term went unpaid and one isn't
  // already running (billing/termBillingService.js#handleTermIndebtedness).
  try {
    await handleTermIndebtedness(schoolId, vacatedTerm);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[academic] term indebtedness check failed:', err);
  }

  return result;
}

async function getCurrentPeriodHistory(schoolId, entityType) {
  const changes = await tenantScoped(CurrentPeriodChange, schoolId).findAll({
    where: entityType ? { entityType } : undefined,
    include: [{ model: User, as: 'changedBy', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'DESC']],
  });

  return changes.map((c) => ({
    id: c.id,
    entityType: c.entityType,
    previousCurrentLabel: c.previousCurrentLabel,
    newCurrentLabel: c.newCurrentLabel,
    reason: c.reason,
    changedAt: c.createdAt,
    changedByName: c.changedBy?.fullName || c.changedBy?.email || null,
  }));
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
  getCurrentPeriodHistory,
  listLevels,
  listClasses,
  createClass,
  updateClass,
  deleteClass,
};
