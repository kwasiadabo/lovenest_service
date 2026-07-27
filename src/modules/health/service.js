const { Op } = require('sequelize');
const {
  SickBayVisit, MedicationLog, Immunization, Student, User,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');

// Never selects passwordHash/resetPasswordTokenHash — same convention as
// financials/service.js's USER_SUMMARY_ATTRIBUTES.
const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

// For DATEONLY columns (administeredDate on Immunization) — plain date
// strings compare correctly as-is.
function dateOnlyRangeWhere(column, from, to) {
  if (from && to) return { [column]: { [Op.between]: [from, to] } };
  if (from) return { [column]: { [Op.gte]: from } };
  if (to) return { [column]: { [Op.lte]: to } };
  return {};
}

// For DATE (with time) columns (visitedAt, administeredAt) — a bare "to"
// date would exclude same-day records after midnight, same reasoning as
// financials/service.js's confirmedAt range filtering.
function dateTimeRangeWhere(column, from, to) {
  if (from && to) return { [column]: { [Op.between]: [`${from} 00:00:00`, `${to} 23:59:59`] } };
  if (from) return { [column]: { [Op.gte]: `${from} 00:00:00` } };
  if (to) return { [column]: { [Op.lte]: `${to} 23:59:59` } };
  return {};
}

async function assertStudentExists(schoolId, studentId) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
}

// ---- Sick bay visits ----

const sickBayInclude = [Student, { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES }];

async function listSickBayVisits(schoolId, { studentId, outcome, from, to } = {}) {
  const where = {};
  if (studentId) where.studentId = studentId;
  if (outcome) where.outcome = outcome;
  Object.assign(where, dateTimeRangeWhere('visitedAt', from, to));

  return tenantScoped(SickBayVisit, schoolId).findAll({
    where, include: sickBayInclude, order: [['visitedAt', 'DESC']],
  });
}

async function createSickBayVisit(schoolId, userId, {
  studentId, visitedAt, reason, treatmentGiven, outcome, notes,
}) {
  await assertStudentExists(schoolId, studentId);
  if (outcome && !SickBayVisit.OUTCOMES.includes(outcome)) {
    throw new ApiError(400, `outcome must be one of: ${SickBayVisit.OUTCOMES.join(', ')}`);
  }

  const visit = await tenantScoped(SickBayVisit, schoolId).create({
    studentId,
    visitedAt: visitedAt || new Date(),
    reason,
    treatmentGiven: treatmentGiven?.trim() || null,
    outcome: outcome || 'RETURNED_TO_CLASS',
    notes: notes?.trim() || null,
    recordedByUserId: userId,
  });
  return tenantScoped(SickBayVisit, schoolId).findByPk(visit.id, { include: sickBayInclude });
}

async function updateSickBayVisit(schoolId, visitId, {
  visitedAt, reason, treatmentGiven, outcome, notes,
}) {
  const visit = await tenantScoped(SickBayVisit, schoolId).findByPk(visitId);
  if (!visit) throw new ApiError(404, 'Sick bay visit not found');
  if (outcome && !SickBayVisit.OUTCOMES.includes(outcome)) {
    throw new ApiError(400, `outcome must be one of: ${SickBayVisit.OUTCOMES.join(', ')}`);
  }

  await visit.update({
    visitedAt: visitedAt || visit.visitedAt,
    reason: reason || visit.reason,
    treatmentGiven: treatmentGiven !== undefined ? (treatmentGiven?.trim() || null) : visit.treatmentGiven,
    outcome: outcome || visit.outcome,
    notes: notes !== undefined ? (notes?.trim() || null) : visit.notes,
  });
  return tenantScoped(SickBayVisit, schoolId).findByPk(visit.id, { include: sickBayInclude });
}

async function deleteSickBayVisit(schoolId, visitId) {
  const deleted = await tenantScoped(SickBayVisit, schoolId).destroy({ where: { id: visitId } });
  if (!deleted) throw new ApiError(404, 'Sick bay visit not found');
}

// ---- Medication logs ----
// Just a log of doses actually given — no separate "ongoing prescription"
// record (see plan decision). Each entry stands alone.

const medicationInclude = [Student, { model: User, as: 'administeredBy', attributes: USER_SUMMARY_ATTRIBUTES }];

async function listMedicationLogs(schoolId, {
  studentId, from, to,
} = {}) {
  const where = {};
  if (studentId) where.studentId = studentId;
  Object.assign(where, dateTimeRangeWhere('administeredAt', from, to));

  return tenantScoped(MedicationLog, schoolId).findAll({
    where, include: medicationInclude, order: [['administeredAt', 'DESC']],
  });
}

async function createMedicationLog(schoolId, userId, {
  studentId, administeredAt, medicationName, dosage, reason, notes,
}) {
  await assertStudentExists(schoolId, studentId);

  const log = await tenantScoped(MedicationLog, schoolId).create({
    studentId,
    administeredAt: administeredAt || new Date(),
    medicationName,
    dosage,
    reason: reason?.trim() || null,
    notes: notes?.trim() || null,
    administeredByUserId: userId,
  });
  return tenantScoped(MedicationLog, schoolId).findByPk(log.id, { include: medicationInclude });
}

async function updateMedicationLog(schoolId, logId, {
  administeredAt, medicationName, dosage, reason, notes,
}) {
  const log = await tenantScoped(MedicationLog, schoolId).findByPk(logId);
  if (!log) throw new ApiError(404, 'Medication log not found');

  await log.update({
    administeredAt: administeredAt || log.administeredAt,
    medicationName: medicationName || log.medicationName,
    dosage: dosage || log.dosage,
    reason: reason !== undefined ? (reason?.trim() || null) : log.reason,
    notes: notes !== undefined ? (notes?.trim() || null) : log.notes,
  });
  return tenantScoped(MedicationLog, schoolId).findByPk(log.id, { include: medicationInclude });
}

async function deleteMedicationLog(schoolId, logId) {
  const deleted = await tenantScoped(MedicationLog, schoolId).destroy({ where: { id: logId } });
  if (!deleted) throw new ApiError(404, 'Medication log not found');
}

// ---- Immunizations ----

const immunizationInclude = [Student, { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES }];

async function listImmunizations(schoolId, { studentId, vaccine } = {}) {
  const where = {};
  if (studentId) where.studentId = studentId;
  if (vaccine) where.vaccine = vaccine;

  return tenantScoped(Immunization, schoolId).findAll({
    where, include: immunizationInclude, order: [['administeredDate', 'DESC']],
  });
}

async function createImmunization(schoolId, userId, {
  studentId, vaccine, otherVaccineName, doseNumber, administeredDate, nextDueDate, notes,
}) {
  await assertStudentExists(schoolId, studentId);
  if (!Immunization.VACCINES.includes(vaccine)) {
    throw new ApiError(400, `vaccine must be one of: ${Immunization.VACCINES.join(', ')}`);
  }
  if (vaccine === 'OTHER' && !otherVaccineName?.trim()) {
    throw new ApiError(400, 'otherVaccineName is required when vaccine is OTHER');
  }

  const immunization = await tenantScoped(Immunization, schoolId).create({
    studentId,
    vaccine,
    otherVaccineName: vaccine === 'OTHER' ? otherVaccineName.trim() : null,
    doseNumber: doseNumber?.trim() || null,
    administeredDate,
    nextDueDate: nextDueDate || null,
    notes: notes?.trim() || null,
    recordedByUserId: userId,
  });
  return tenantScoped(Immunization, schoolId).findByPk(immunization.id, { include: immunizationInclude });
}

async function updateImmunization(schoolId, immunizationId, {
  vaccine, otherVaccineName, doseNumber, administeredDate, nextDueDate, notes,
}) {
  const immunization = await tenantScoped(Immunization, schoolId).findByPk(immunizationId);
  if (!immunization) throw new ApiError(404, 'Immunization record not found');

  const effectiveVaccine = vaccine || immunization.vaccine;
  if (vaccine && !Immunization.VACCINES.includes(vaccine)) {
    throw new ApiError(400, `vaccine must be one of: ${Immunization.VACCINES.join(', ')}`);
  }
  if (effectiveVaccine === 'OTHER' && !(otherVaccineName ?? immunization.otherVaccineName)?.trim()) {
    throw new ApiError(400, 'otherVaccineName is required when vaccine is OTHER');
  }

  await immunization.update({
    vaccine: effectiveVaccine,
    otherVaccineName: effectiveVaccine === 'OTHER' ? (otherVaccineName ?? immunization.otherVaccineName)?.trim() : null,
    doseNumber: doseNumber !== undefined ? (doseNumber?.trim() || null) : immunization.doseNumber,
    administeredDate: administeredDate || immunization.administeredDate,
    nextDueDate: nextDueDate !== undefined ? (nextDueDate || null) : immunization.nextDueDate,
    notes: notes !== undefined ? (notes?.trim() || null) : immunization.notes,
  });
  return tenantScoped(Immunization, schoolId).findByPk(immunization.id, { include: immunizationInclude });
}

async function deleteImmunization(schoolId, immunizationId) {
  const deleted = await tenantScoped(Immunization, schoolId).destroy({ where: { id: immunizationId } });
  if (!deleted) throw new ApiError(404, 'Immunization record not found');
}

// ---- Reporting ----
// One combined report across all three trackers, scoped to an optional date
// range (sick bay visits by visitedAt, medication logs by administeredAt,
// immunizations by administeredDate) — mirrors incidents/service.js's single
// analytics endpoint rather than three separate report pages.

async function getHealthAnalytics(schoolId, { from, to } = {}) {
  const sickBayWhere = dateTimeRangeWhere('visitedAt', from, to);
  const medicationWhere = dateTimeRangeWhere('administeredAt', from, to);
  const immunizationWhere = dateOnlyRangeWhere('administeredDate', from, to);

  const [visits, medications, immunizations] = await Promise.all([
    tenantScoped(SickBayVisit, schoolId).findAll({ where: sickBayWhere, include: [Student] }),
    tenantScoped(MedicationLog, schoolId).findAll({ where: medicationWhere, include: [Student] }),
    tenantScoped(Immunization, schoolId).findAll({ where: immunizationWhere, include: [Student] }),
  ]);

  const byOutcomeMap = new Map();
  const sickBayByDateMap = new Map();
  const sickBayTopStudentsMap = new Map();
  for (const visit of visits) {
    const outcomeEntry = byOutcomeMap.get(visit.outcome) || { outcome: visit.outcome, count: 0 };
    outcomeEntry.count += 1;
    byOutcomeMap.set(visit.outcome, outcomeEntry);

    const day = visit.visitedAt.toISOString().slice(0, 10);
    const dateEntry = sickBayByDateMap.get(day) || { date: day, count: 0 };
    dateEntry.count += 1;
    sickBayByDateMap.set(day, dateEntry);

    const studentEntry = sickBayTopStudentsMap.get(visit.studentId) || { name: visit.Student?.fullName, count: 0 };
    studentEntry.count += 1;
    sickBayTopStudentsMap.set(visit.studentId, studentEntry);
  }

  const byMedicationNameMap = new Map();
  for (const log of medications) {
    const entry = byMedicationNameMap.get(log.medicationName) || { medicationName: log.medicationName, count: 0 };
    entry.count += 1;
    byMedicationNameMap.set(log.medicationName, entry);
  }

  const byVaccineMap = new Map();
  const studentsImmunizedSet = new Set();
  for (const immunization of immunizations) {
    const key = immunization.vaccine === 'OTHER' ? (immunization.otherVaccineName || 'Other') : immunization.vaccine;
    const entry = byVaccineMap.get(key) || { vaccine: key, count: 0 };
    entry.count += 1;
    byVaccineMap.set(key, entry);
    studentsImmunizedSet.add(immunization.studentId);
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcomingDue = immunizations
    .filter((i) => i.nextDueDate && i.nextDueDate >= today)
    .sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1))
    .slice(0, 10)
    .map((i) => ({
      studentId: i.studentId,
      studentName: i.Student?.fullName,
      vaccine: i.vaccine === 'OTHER' ? i.otherVaccineName : i.vaccine,
      nextDueDate: i.nextDueDate,
    }));

  return {
    scope: { from: from || null, to: to || null },
    sickBay: {
      totalVisits: visits.length,
      byOutcome: [...byOutcomeMap.values()].sort((a, b) => b.count - a.count),
      trend: [...sickBayByDateMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
      topStudents: [...sickBayTopStudentsMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    },
    medication: {
      totalLogs: medications.length,
      byMedicationName: [...byMedicationNameMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    },
    immunization: {
      totalRecords: immunizations.length,
      studentsImmunizedCount: studentsImmunizedSet.size,
      byVaccine: [...byVaccineMap.values()].sort((a, b) => b.count - a.count),
      upcomingDue,
    },
  };
}

module.exports = {
  listSickBayVisits,
  createSickBayVisit,
  updateSickBayVisit,
  deleteSickBayVisit,
  listMedicationLogs,
  createMedicationLog,
  updateMedicationLog,
  deleteMedicationLog,
  listImmunizations,
  createImmunization,
  updateImmunization,
  deleteImmunization,
  getHealthAnalytics,
};
