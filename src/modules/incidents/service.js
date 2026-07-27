const { Op } = require('sequelize');
const {
  Incident, Student, Staff, User,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

// Never selects passwordHash/resetPasswordTokenHash — same convention as
// financials/service.js's USER_SUMMARY_ATTRIBUTES.
const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

const baseInclude = [
  Student,
  Staff,
  { model: User, as: 'reportedBy', attributes: USER_SUMMARY_ATTRIBUTES },
];

function assertValidSubject(subjectType, studentId, staffId) {
  if (!Incident.SUBJECT_TYPES.includes(subjectType)) {
    throw new ApiError(400, `subjectType must be one of: ${Incident.SUBJECT_TYPES.join(', ')}`);
  }
  if (subjectType === 'STUDENT' && !studentId) throw new ApiError(400, 'studentId is required when subjectType is STUDENT');
  if (subjectType === 'STAFF' && !staffId) throw new ApiError(400, 'staffId is required when subjectType is STAFF');
}

async function assertSubjectExists(schoolId, subjectType, studentId, staffId) {
  if (subjectType === 'STUDENT') {
    const student = await tenantScoped(Student, schoolId).findByPk(studentId);
    if (!student) throw new ApiError(404, 'Student not found');
  } else {
    const staff = await tenantScoped(Staff, schoolId).findByPk(staffId);
    if (!staff) throw new ApiError(404, 'Staff member not found');
  }
}

async function listIncidents(schoolId, {
  subjectType, studentId, staffId, category, severity, status, from, to,
} = {}) {
  const where = {};
  if (subjectType) where.subjectType = subjectType;
  if (studentId) where.studentId = studentId;
  if (staffId) where.staffId = staffId;
  if (category) where.category = category;
  if (severity) where.severity = severity;
  if (status) where.status = status;
  if (from && to) where.incidentDate = { [Op.between]: [from, to] };
  else if (from) where.incidentDate = { [Op.gte]: from };
  else if (to) where.incidentDate = { [Op.lte]: to };

  return tenantScoped(Incident, schoolId).findAll({
    where,
    include: baseInclude,
    order: [['incidentDate', 'DESC'], ['createdAt', 'DESC']],
  });
}

async function getIncident(schoolId, incidentId) {
  const incident = await tenantScoped(Incident, schoolId).findByPk(incidentId, { include: baseInclude });
  if (!incident) throw new ApiError(404, 'Incident not found');
  return incident;
}

async function createIncident(schoolId, userId, {
  subjectType, studentId, staffId, incidentDate, category, severity, description,
}) {
  assertValidSubject(subjectType, studentId, staffId);
  await assertSubjectExists(schoolId, subjectType, studentId, staffId);

  if (!Incident.CATEGORIES.includes(category)) {
    throw new ApiError(400, `category must be one of: ${Incident.CATEGORIES.join(', ')}`);
  }
  if (severity && !Incident.SEVERITIES.includes(severity)) {
    throw new ApiError(400, `severity must be one of: ${Incident.SEVERITIES.join(', ')}`);
  }

  const incident = await tenantScoped(Incident, schoolId).create({
    subjectType,
    studentId: subjectType === 'STUDENT' ? studentId : null,
    staffId: subjectType === 'STAFF' ? staffId : null,
    incidentDate,
    category,
    severity: severity || 'MINOR',
    description,
    reportedByUserId: userId,
    status: 'OPEN',
  });
  return getIncident(schoolId, incident.id);
}

async function updateIncident(schoolId, incidentId, {
  incidentDate, category, severity, description,
}) {
  const incident = await tenantScoped(Incident, schoolId).findByPk(incidentId);
  if (!incident) throw new ApiError(404, 'Incident not found');

  if (category && !Incident.CATEGORIES.includes(category)) {
    throw new ApiError(400, `category must be one of: ${Incident.CATEGORIES.join(', ')}`);
  }
  if (severity && !Incident.SEVERITIES.includes(severity)) {
    throw new ApiError(400, `severity must be one of: ${Incident.SEVERITIES.join(', ')}`);
  }

  await incident.update({
    incidentDate: incidentDate || incident.incidentDate,
    category: category || incident.category,
    severity: severity || incident.severity,
    description: description ?? incident.description,
  });
  return getIncident(schoolId, incident.id);
}

async function setIncidentStatus(schoolId, incidentId, status) {
  const incident = await tenantScoped(Incident, schoolId).findByPk(incidentId);
  if (!incident) throw new ApiError(404, 'Incident not found');
  if (!Incident.STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${Incident.STATUSES.join(', ')}`);
  }
  await incident.update({ status });
  return getIncident(schoolId, incident.id);
}

// A null actionType clears any previously recorded action — e.g. it was
// entered by mistake, or the matter was resolved without formal discipline.
async function recordAction(schoolId, incidentId, {
  actionType, actionDate, actionDetails, actionStatus,
}) {
  const incident = await tenantScoped(Incident, schoolId).findByPk(incidentId);
  if (!incident) throw new ApiError(404, 'Incident not found');

  if (!actionType) {
    await incident.update({
      actionType: null, actionDate: null, actionDetails: null, actionStatus: null,
    });
    return getIncident(schoolId, incident.id);
  }

  if (!Incident.ACTION_TYPES.includes(actionType)) {
    throw new ApiError(400, `actionType must be one of: ${Incident.ACTION_TYPES.join(', ')}`);
  }
  const effectiveActionStatus = actionStatus || 'PENDING';
  if (!Incident.ACTION_STATUSES.includes(effectiveActionStatus)) {
    throw new ApiError(400, `actionStatus must be one of: ${Incident.ACTION_STATUSES.join(', ')}`);
  }

  await incident.update({
    actionType,
    actionDate: actionDate || null,
    actionDetails: actionDetails?.trim() || null,
    actionStatus: effectiveActionStatus,
  });
  return getIncident(schoolId, incident.id);
}

async function deleteIncident(schoolId, incidentId) {
  const deleted = await tenantScoped(Incident, schoolId).destroy({ where: { id: incidentId } });
  if (!deleted) throw new ApiError(404, 'Incident not found');
}

// ---- Reporting ----

async function getIncidentAnalytics(schoolId, { from, to } = {}) {
  const where = {};
  if (from && to) where.incidentDate = { [Op.between]: [from, to] };
  else if (from) where.incidentDate = { [Op.gte]: from };
  else if (to) where.incidentDate = { [Op.lte]: to };

  const incidents = await tenantScoped(Incident, schoolId).findAll({
    where,
    include: [Student, Staff],
    order: [['incidentDate', 'ASC']],
  });

  let studentCount = 0;
  let staffCount = 0;
  let openCount = 0;
  let resolvedCount = 0;
  let withActionCount = 0;
  const byCategoryMap = new Map();
  const bySeverityMap = new Map();
  const byActionTypeMap = new Map();
  const byDateMap = new Map();
  const bySubjectMap = new Map();

  for (const incident of incidents) {
    if (incident.subjectType === 'STUDENT') studentCount += 1;
    else staffCount += 1;

    if (incident.status === 'OPEN') openCount += 1;
    else resolvedCount += 1;

    if (incident.actionType) {
      withActionCount += 1;
      const entry = byActionTypeMap.get(incident.actionType) || { actionType: incident.actionType, count: 0 };
      entry.count += 1;
      byActionTypeMap.set(incident.actionType, entry);
    }

    const categoryEntry = byCategoryMap.get(incident.category) || { category: incident.category, count: 0 };
    categoryEntry.count += 1;
    byCategoryMap.set(incident.category, categoryEntry);

    const severityEntry = bySeverityMap.get(incident.severity) || { severity: incident.severity, count: 0 };
    severityEntry.count += 1;
    bySeverityMap.set(incident.severity, severityEntry);

    const dateEntry = byDateMap.get(incident.incidentDate) || { date: incident.incidentDate, count: 0 };
    dateEntry.count += 1;
    byDateMap.set(incident.incidentDate, dateEntry);

    const subjectKey = incident.subjectType === 'STUDENT' ? `student:${incident.studentId}` : `staff:${incident.staffId}`;
    const subjectEntry = bySubjectMap.get(subjectKey) || {
      subjectType: incident.subjectType,
      name: incident.subjectType === 'STUDENT' ? incident.Student?.fullName : incident.Staff?.fullName,
      count: 0,
    };
    subjectEntry.count += 1;
    bySubjectMap.set(subjectKey, subjectEntry);
  }

  const topSubjects = [...bySubjectMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    scope: { from: from || null, to: to || null },
    summary: {
      totalIncidents: incidents.length,
      studentCount,
      staffCount,
      openCount,
      resolvedCount,
      withActionCount,
    },
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.count - a.count),
    bySeverity: [...bySeverityMap.values()].sort((a, b) => b.count - a.count),
    byActionType: [...byActionTypeMap.values()].sort((a, b) => b.count - a.count),
    trend: [...byDateMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    topSubjects,
  };
}

module.exports = {
  listIncidents,
  getIncident,
  createIncident,
  updateIncident,
  setIncidentStatus,
  recordAction,
  deleteIncident,
  getIncidentAnalytics,
};
