const {
  sequelize, Activity, ActivityRating, Class, Level, Term, Staff,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { resolveRoster } = require('../../utils/classRoster');
const { assertClassScopeAccess } = require('../attendance/service');

// Fixed, non-configurable 4-point developmental scale for Nursery/KG
// activities — unlike the numeric grade bands used for Primary/JHS
// (gradingSettings/service.js), this doesn't vary per school.
const RATING_LABELS = {
  BEGINNING: 'Beginning',
  DEVELOPING: 'Developing',
  PROFICIENT: 'Proficient',
  EXCELLING: 'Excelling',
};
const RATING_VALUES = Object.keys(RATING_LABELS);

async function resolveClass(schoolId, classId) {
  const klass = await tenantScoped(Class, schoolId).findByPk(classId, { include: [Level] });
  if (!klass) throw new ApiError(404, 'Class not found');
  return klass;
}

// Reference data, grouped by domain then sequenceOrder — same read
// convention as listSubjects/listLevels (no scope check; any authenticated
// staff can see the curriculum).
async function listActivities(schoolId, levelId) {
  return tenantScoped(Activity, schoolId).findAll({
    where: levelId ? { levelId } : undefined,
    include: [{ model: Staff, as: 'createdBy' }],
    order: [['domain', 'ASC'], ['sequenceOrder', 'ASC']],
  });
}

async function createActivity(schoolId, userId, {
  levelId, domain, name, description,
}) {
  const level = await tenantScoped(Level, schoolId).findByPk(levelId);
  if (!level) throw new ApiError(404, 'Level not found');

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  const sequenceOrder = await tenantScoped(Activity, schoolId).count({ where: { levelId } });

  const activity = await tenantScoped(Activity, schoolId).create({
    levelId,
    domain,
    name,
    description: description || null,
    sequenceOrder,
    createdByStaffId: staffMember ? staffMember.id : null,
  });

  return { ...activity.toJSON(), createdByName: staffMember ? staffMember.fullName : null };
}

async function updateActivity(schoolId, activityId, { domain, name, description }) {
  const activity = await tenantScoped(Activity, schoolId).findByPk(activityId);
  if (!activity) throw new ApiError(404, 'Activity not found');

  await activity.update({
    ...(domain !== undefined ? { domain } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
  });
  return activity;
}

async function deleteActivity(schoolId, activityId) {
  const activity = await tenantScoped(Activity, schoolId).findByPk(activityId);
  if (!activity) throw new ApiError(404, 'Activity not found');

  // activityId is NO ACTION, not CASCADE (see the create-activity-ratings
  // migration), so ratings must be cleared explicitly before the activity.
  await sequelize.transaction(async (transaction) => {
    await tenantScoped(ActivityRating, schoolId).destroy({ where: { activityId }, transaction });
    await tenantScoped(Activity, schoolId).destroy({ where: { id: activityId }, transaction });
  });
}

async function getRatingGrid(schoolId, userId, roles, { classId, termId }) {
  await assertClassScopeAccess(schoolId, { userId, roles, classId });

  const klass = await resolveClass(schoolId, classId);
  const students = await resolveRoster(schoolId, classId, termId);
  const activities = await listActivities(schoolId, klass.levelId);

  const activityIds = activities.map((a) => a.id);
  const ratingRows = activityIds.length > 0
    ? await tenantScoped(ActivityRating, schoolId).findAll({
      where: { activityId: activityIds, classId, termId },
      include: [{ model: Staff, as: 'recordedBy' }],
    })
    : [];

  const ratingsByStudent = {};
  for (const row of ratingRows) {
    ratingsByStudent[row.studentId] = ratingsByStudent[row.studentId] || {};
    ratingsByStudent[row.studentId][row.activityId] = {
      rating: row.rating,
      status: row.status,
      recordedByName: row.recordedBy ? row.recordedBy.fullName : null,
    };
  }

  // Mirrors getExamGrid's allConfirmed: "true" once every entry that exists
  // is locked, not the whole roster/activity matrix — an activity never
  // rated for a student simply isn't part of the confirmed set.
  const allConfirmed = ratingRows.length > 0 && ratingRows.every((row) => row.status === 'CONFIRMED');

  return {
    levelName: klass.Level ? klass.Level.name : null,
    students,
    activities: activities.map((a) => ({
      id: a.id,
      domain: a.domain,
      name: a.name,
      description: a.description,
    })),
    ratings: ratingsByStudent,
    ratingLabels: RATING_LABELS,
    allConfirmed,
  };
}

async function saveRating(schoolId, userId, roles, {
  activityId, classId, termId, studentId, rating,
}) {
  await assertClassScopeAccess(schoolId, { userId, roles, classId });

  if (!RATING_VALUES.includes(rating)) {
    throw new ApiError(400, `rating must be one of: ${RATING_VALUES.join(', ')}`);
  }

  const activity = await tenantScoped(Activity, schoolId).findByPk(activityId);
  if (!activity) throw new ApiError(404, 'Activity not found');

  const klass = await resolveClass(schoolId, classId);
  if (activity.levelId !== klass.levelId) {
    throw new ApiError(400, 'This activity does not belong to this class\'s level.');
  }

  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });

  const existing = await tenantScoped(ActivityRating, schoolId).findOne({
    where: {
      activityId, classId, termId, studentId,
    },
  });
  if (existing && existing.status === 'CONFIRMED') {
    throw new ApiError(400, 'These ratings have been confirmed and can no longer be edited. Ask a school admin to reopen them first.');
  }

  const values = { rating, recordedByStaffId: staffMember ? staffMember.id : null };
  const saved = existing
    ? await existing.update(values)
    : await tenantScoped(ActivityRating, schoolId).create({
      activityId, classId, termId, studentId, ...values,
    });

  return { ...saved.toJSON(), recordedByName: staffMember ? staffMember.fullName : null };
}

// Locks every currently-existing rating row for a class+term across every
// activity — same "the entries that were made," not the whole roster/
// activity matrix, convention as confirmExamScores.
async function confirmRatings(schoolId, userId, roles, { classId, termId }) {
  await assertClassScopeAccess(schoolId, { userId, roles, classId });
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });

  const [confirmedCount] = await tenantScoped(ActivityRating, schoolId).update({
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    confirmedByStaffId: staffMember ? staffMember.id : null,
  }, {
    where: { classId, termId, status: 'DRAFT' },
  });

  if (confirmedCount === 0) {
    throw new ApiError(400, 'No activity ratings have been entered for this class yet.');
  }
  return { confirmedCount };
}

// SCHOOL_ADMIN only, same escape-hatch convention as reopenExamScores.
async function reopenRatings(schoolId, userId, roles, { classId, termId }) {
  if (!roles.includes('SCHOOL_ADMIN')) {
    throw new ApiError(403, 'Only a school admin can reopen confirmed activity ratings.');
  }
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const [reopenedCount] = await tenantScoped(ActivityRating, schoolId).update({
    status: 'DRAFT',
    confirmedAt: null,
    confirmedByStaffId: null,
  }, {
    where: { classId, termId, status: 'CONFIRMED' },
  });

  return { reopenedCount };
}

// Consumed by reportCards/service.js for Nursery/KG report cards — grouped
// by domain, each activity flagged `pending` when there's no CONFIRMED
// rating yet, same convention as computeSubjectRow's pending flag (a report
// card never silently shows a stale/blank rating for an activity still
// being assessed).
async function getConfirmedRatingsForReportCard(schoolId, { classId, termId, studentId }) {
  const klass = await resolveClass(schoolId, classId);
  const activities = await listActivities(schoolId, klass.levelId);

  const activityIds = activities.map((a) => a.id);
  const ratingRows = activityIds.length > 0
    ? await tenantScoped(ActivityRating, schoolId).findAll({
      where: {
        activityId: activityIds, classId, termId, studentId,
      },
    })
    : [];
  const ratingByActivity = new Map(ratingRows.map((row) => [row.activityId, row]));

  const byDomain = new Map();
  activities.forEach((activity) => {
    const row = ratingByActivity.get(activity.id);
    const confirmed = row && row.status === 'CONFIRMED';
    const entry = {
      activityId: activity.id,
      name: activity.name,
      pending: !confirmed,
      rating: confirmed ? row.rating : null,
      ratingLabel: confirmed ? RATING_LABELS[row.rating] : null,
    };
    if (!byDomain.has(activity.domain)) byDomain.set(activity.domain, []);
    byDomain.get(activity.domain).push(entry);
  });

  return [...byDomain.entries()].map(([domain, domainActivities]) => ({ domain, activities: domainActivities }));
}

module.exports = {
  RATING_LABELS,
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  getRatingGrid,
  saveRating,
  confirmRatings,
  reopenRatings,
  getConfirmedRatingsForReportCard,
};
