const { Op } = require('sequelize');
const {
  sequelize, Class, Subject, Staff, SubjectTeacher, ClassTeacher, TimetablePeriod, TimetableSlot,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

// ---- Periods (setup / bell schedule) ----

async function listPeriods(schoolId) {
  return tenantScoped(TimetablePeriod, schoolId).findAll({ order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
}

async function createPeriod(schoolId, {
  name, startTime, endTime, sortOrder, isBreak,
}) {
  return tenantScoped(TimetablePeriod, schoolId).create({
    name, startTime, endTime, sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0, isBreak: !!isBreak,
  });
}

async function updatePeriod(schoolId, periodId, {
  name, startTime, endTime, sortOrder, isBreak,
}) {
  const period = await tenantScoped(TimetablePeriod, schoolId).findByPk(periodId);
  if (!period) throw new ApiError(404, 'Period not found');
  await period.update({
    name, startTime, endTime, sortOrder: sortOrder !== undefined ? Number(sortOrder) : period.sortOrder, isBreak: !!isBreak,
  });
  return period;
}

// Removing a period also removes every timetable slot built on it — an
// orphaned TimetableSlot pointing at a deleted period has no use (mirrors
// expenses/service.js's deleteExpenseItem convention).
async function deletePeriod(schoolId, periodId) {
  await sequelize.transaction(async (transaction) => {
    await tenantScoped(TimetableSlot, schoolId).destroy({ where: { periodId }, transaction });
    const deleted = await tenantScoped(TimetablePeriod, schoolId).destroy({ where: { id: periodId }, transaction });
    if (!deleted) throw new ApiError(404, 'Period not found');
  });
}

// ---- Class timetable (grid) ----

const SLOT_INCLUDE = [Subject, Staff, TimetablePeriod];

async function getClassTimetable(schoolId, classId) {
  const klass = await tenantScoped(Class, schoolId).findByPk(classId);
  if (!klass) throw new ApiError(404, 'Class not found');

  const [periods, subjectTeachers, classTeachers, slots] = await Promise.all([
    listPeriods(schoolId),
    tenantScoped(SubjectTeacher, schoolId).findAll({ where: { classId }, include: [Subject, Staff] }),
    // Read-only context for the timetable page — who the class teacher(s)
    // are, same source of truth as Teacher Assignments' Class Teacher tab,
    // just surfaced here instead of requiring a second round trip to a
    // route this page's roles (SCHOOL_ADMIN/HEAD_TEACHER) may not both hold.
    tenantScoped(ClassTeacher, schoolId).findAll({ where: { classId }, include: [Staff] }),
    tenantScoped(TimetableSlot, schoolId).findAll({ where: { classId }, include: SLOT_INCLUDE }),
  ]);

  return {
    class: klass, periods, subjectTeachers, classTeachers, slots,
  };
}

function dayLabel(dayOfWeek) {
  return dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase();
}

// Replaces a class's entire weekly grid in one call — simpler and less
// error-prone than diffing cell-by-cell, since a grid edit routinely touches
// several cells at once. `entries` with no subjectId are just omitted (an
// empty cell has no row). staffId defaults to whatever SubjectTeacher says
// for that class+subject, but the client may override it to any of the
// class's own class teachers instead (e.g. a class teacher personally
// covering a period) — anyone else is rejected. A subject with no
// SubjectTeacher on record for this class can still be scheduled as long as
// the entry names one of the class's class teachers directly — this is what
// lets a class with no subject teachers assigned yet (only a class teacher)
// still build a timetable, and vice versa. A teacher already booked into
// another class at the same day+period blocks the whole save before
// anything is written.
async function saveClassTimetable(schoolId, classId, entries) {
  const klass = await tenantScoped(Class, schoolId).findByPk(classId);
  if (!klass) throw new ApiError(404, 'Class not found');

  const toSave = entries.filter((e) => e.subjectId);

  const classTeacherIds = new Set(
    (await tenantScoped(ClassTeacher, schoolId).findAll({ where: { classId } })).map((ct) => ct.staffId),
  );

  const resolved = [];
  for (const entry of toSave) {
    const subjectTeacher = await tenantScoped(SubjectTeacher, schoolId).findOne({
      where: { classId, subjectId: entry.subjectId },
      include: [Subject],
    });

    let staffId;
    if (subjectTeacher) {
      ({ staffId } = subjectTeacher);
      if (entry.staffId && entry.staffId !== staffId) {
        if (!classTeacherIds.has(entry.staffId)) {
          throw new ApiError(400, 'A slot\'s teacher must be either that subject\'s assigned teacher or one of this class\'s class teachers.');
        }
        staffId = entry.staffId;
      }
    } else {
      if (!entry.staffId || !classTeacherIds.has(entry.staffId)) {
        throw new ApiError(400, 'This subject has no teacher assigned to this class yet — set it up in Teacher Assignments, or assign the slot to one of this class\'s class teachers.');
      }
      const subject = await tenantScoped(Subject, schoolId).findByPk(entry.subjectId);
      if (!subject) throw new ApiError(400, 'Subject not found');
      staffId = entry.staffId;
    }

    resolved.push({
      dayOfWeek: entry.dayOfWeek,
      periodId: entry.periodId,
      subjectId: entry.subjectId,
      staffId,
    });
  }

  for (const entry of resolved) {
    const conflict = await tenantScoped(TimetableSlot, schoolId).findOne({
      where: {
        dayOfWeek: entry.dayOfWeek,
        periodId: entry.periodId,
        staffId: entry.staffId,
        classId: { [Op.ne]: classId },
      },
      include: [Class, TimetablePeriod, Staff],
    });
    if (conflict) {
      throw new ApiError(
        409,
        `${conflict.Staff.fullName} is already teaching ${conflict.Class.name} during ${conflict.TimetablePeriod.name} on ${dayLabel(entry.dayOfWeek)}.`,
      );
    }
  }

  await sequelize.transaction(async (transaction) => {
    await tenantScoped(TimetableSlot, schoolId).destroy({ where: { classId }, transaction });
    if (resolved.length > 0) {
      await tenantScoped(TimetableSlot, schoolId).bulkCreate(
        resolved.map((e) => ({
          classId, periodId: e.periodId, dayOfWeek: e.dayOfWeek, subjectId: e.subjectId, staffId: e.staffId,
        })),
        { transaction },
      );
    }
  });

  return getClassTimetable(schoolId, classId);
}

module.exports = {
  listPeriods,
  createPeriod,
  updatePeriod,
  deletePeriod,
  getClassTimetable,
  saveClassTimetable,
};
