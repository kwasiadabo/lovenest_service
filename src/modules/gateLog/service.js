const { Op } = require('sequelize');
const {
  Student, StudentParent, Parent, AuthorizedPickupPerson, GateLogRecord, School,
  StudentClassAssignment, Class, Level, AcademicYear,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { notifyRoles } = require('../notifications/service');
// Reused rather than re-querying StudentParent/Parent from scratch — same
// father/mother shape the Student Profile page already uses, so the
// check-out picker's "Father"/"Mother" options carry a real Parent id.
const { attachParents } = require('../students/service');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusFor(record) {
  if (!record || !record.checkedInAt) return 'NOT_IN';
  if (!record.checkedOutAt) return 'CHECKED_IN';
  return 'CHECKED_OUT';
}

function classLabel(assignment) {
  if (!assignment?.Class) return null;
  return assignment.Class.Level ? `${assignment.Class.name} (${assignment.Class.Level.name})` : assignment.Class.name;
}

// Whole-school, not class/bus-scoped — a gate event is relevant to every
// student regardless of whether they ride the bus (unlike attendance's
// class-teacher scoping or transport's vehicle-roster scoping).
async function getStudentsWithGateStatus(schoolId, { date, search } = {}) {
  const day = date || todayIso();

  const students = await tenantScoped(Student, schoolId).findAll({
    where: { status: 'ACTIVE' },
    order: [['lastName', 'ASC'], ['firstName', 'ASC']],
  });

  const query = (search || '').trim().toLowerCase();
  const filtered = query
    ? students.filter((s) => s.fullName.toLowerCase().includes(query) || s.studentNumber.toLowerCase().includes(query))
    : students;

  const records = filtered.length > 0
    ? await tenantScoped(GateLogRecord, schoolId).findAll({
      where: { date: day, studentId: filtered.map((s) => s.id) },
    })
    : [];
  const recordByStudentId = new Map(records.map((r) => [r.studentId, r]));

  const withParents = await attachParents(schoolId, filtered);

  return withParents.map((student) => {
    const record = recordByStudentId.get(student.id);
    return {
      id: student.id,
      fullName: student.fullName,
      studentNumber: student.studentNumber,
      selfDismissalAuthorized: student.selfDismissalAuthorized,
      father: student.father ? { id: student.father.id, fullName: student.father.fullName } : null,
      mother: student.mother ? { id: student.mother.id, fullName: student.mother.fullName } : null,
      status: statusFor(record),
      checkedInAt: record?.checkedInAt || null,
      checkedOutAt: record?.checkedOutAt || null,
      checkedOutByName: record?.checkedOutByName || null,
      wasUnauthorizedPickup: record?.wasUnauthorizedPickup || false,
    };
  });
}

// Resolves a scanned ID card's QR payload to the same row shape
// getStudentsWithGateStatus returns for one student — so the frontend can
// feed the result straight into the existing check-in/check-out UI (which
// already expects student.father/mother/selfDismissalAuthorized/status) —
// plus photoUrl/className so gate staff can visually confirm the card
// belongs to the student standing in front of them.
async function verifyScan(schoolId, { studentId, studentNumber }) {
  if (!studentId) throw new ApiError(400, 'studentId is required');

  const student = await tenantScoped(Student, schoolId).findOne({
    where: { id: studentId, status: 'ACTIVE' },
  });
  if (!student) {
    throw new ApiError(404, 'This ID card was not recognized — the student may be inactive, or the card is from a different school.');
  }
  // Redundant with studentId (already the source of truth via the
  // schoolId-scoped lookup above) but catches a stale or tampered scan
  // before it's treated as a real match.
  if (studentNumber && student.studentNumber !== studentNumber) {
    throw new ApiError(400, "This ID card doesn't match our records.");
  }

  const day = todayIso();
  const [record, currentYear, [withParents]] = await Promise.all([
    tenantScoped(GateLogRecord, schoolId).findOne({ where: { studentId, date: day } }),
    tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } }),
    attachParents(schoolId, [student]),
  ]);

  const currentClassAssignment = currentYear
    ? await tenantScoped(StudentClassAssignment, schoolId).findOne({
      where: { studentId, academicYearId: currentYear.id },
      include: [{ model: Class, include: [Level] }],
    })
    : null;

  return {
    id: student.id,
    fullName: student.fullName,
    studentNumber: student.studentNumber,
    photoUrl: student.photoUrl,
    className: classLabel(currentClassAssignment),
    selfDismissalAuthorized: student.selfDismissalAuthorized,
    father: withParents.father ? { id: withParents.father.id, fullName: withParents.father.fullName } : null,
    mother: withParents.mother ? { id: withParents.mother.id, fullName: withParents.mother.fullName } : null,
    status: statusFor(record),
    checkedInAt: record?.checkedInAt || null,
    checkedOutAt: record?.checkedOutAt || null,
    checkedOutByName: record?.checkedOutByName || null,
    wasUnauthorizedPickup: record?.wasUnauthorizedPickup || false,
  };
}

async function recordCheckIn(schoolId, userId, {
  studentId, date, byName, byRelationship, notes,
}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const day = date || todayIso();
  const existing = await tenantScoped(GateLogRecord, schoolId).findOne({ where: { studentId, date: day } });
  if (existing && existing.checkedInAt) throw new ApiError(400, `${student.fullName} has already been checked in today.`);

  const values = {
    checkedInAt: new Date(),
    checkedInByName: byName?.trim() || null,
    checkedInByRelationship: byRelationship?.trim() || null,
    recordedInByUserId: userId,
    notes: notes?.trim() || null,
  };

  return existing
    ? existing.update(values)
    : tenantScoped(GateLogRecord, schoolId).create({ studentId, date: day, ...values });
}

async function recordCheckOut(schoolId, userId, {
  studentId, date, type, parentId, authorizedPersonId, byName, byRelationship, notes, override,
}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const day = date || todayIso();
  const record = await tenantScoped(GateLogRecord, schoolId).findOne({ where: { studentId, date: day } });
  if (!record || !record.checkedInAt) throw new ApiError(400, `${student.fullName} has not been checked in today.`);
  if (record.checkedOutAt) throw new ApiError(400, `${student.fullName} has already been checked out today.`);

  let checkedOutByName = byName?.trim() || null;
  let checkedOutByRelationship = byRelationship?.trim() || null;
  let wasUnauthorizedPickup = false;

  if (type === 'PARENT') {
    const link = await tenantScoped(StudentParent, schoolId).findOne({
      where: { studentId, parentId }, include: [Parent],
    });
    if (!link) throw new ApiError(400, 'This parent is not linked to this student.');
    checkedOutByName = link.Parent.fullName;
    checkedOutByRelationship = link.relationship === 'FATHER' ? 'Father' : 'Mother';
  } else if (type === 'AUTHORIZED_PERSON') {
    const person = await tenantScoped(AuthorizedPickupPerson, schoolId).findOne({
      where: {
        id: authorizedPersonId, studentId, status: 'ACTIVE',
      },
    });
    if (!person) throw new ApiError(400, 'This person is not on the active authorized-pickup list for this student.');
    checkedOutByName = person.fullName;
    checkedOutByRelationship = person.relationship;
  } else if (type === 'SELF_DISMISSAL') {
    // Server-side, never trust the frontend to gate this.
    if (!student.selfDismissalAuthorized) {
      throw new ApiError(403, 'This student is not authorized for self-dismissal.');
    }
    checkedOutByName = null;
    checkedOutByRelationship = null;
  } else {
    // OVERRIDE — the "not on the approved list" escape hatch. Requires the
    // frontend's confirm-dialog result (validators.js already checked
    // override===true and byName presence before this ever runs).
    if (override !== true) {
      throw new ApiError(400, 'This person is not on the approved pickup list. Confirm the override to record this pickup.');
    }
    wasUnauthorizedPickup = true;
  }

  return record.update({
    checkedOutAt: new Date(),
    checkedOutByType: type,
    checkedOutByParentId: type === 'PARENT' ? parentId : null,
    checkedOutByAuthorizedPersonId: type === 'AUTHORIZED_PERSON' ? authorizedPersonId : null,
    checkedOutByName,
    checkedOutByRelationship,
    wasUnauthorizedPickup,
    recordedOutByUserId: userId,
    notes: notes?.trim() || record.notes,
  });
}

async function getAuthorizedPickupPersons(schoolId, studentId) {
  return tenantScoped(AuthorizedPickupPerson, schoolId).findAll({
    where: { studentId },
    order: [['fullName', 'ASC']],
  });
}

async function addAuthorizedPickupPerson(schoolId, studentId, userId, {
  fullName, relationship, phone, notes,
}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  return tenantScoped(AuthorizedPickupPerson, schoolId).create({
    studentId,
    fullName: fullName.trim(),
    relationship: relationship.trim(),
    phone: phone?.trim() || null,
    notes: notes?.trim() || null,
    addedByUserId: userId,
  });
}

async function updateAuthorizedPickupPerson(schoolId, id, {
  fullName, relationship, phone, notes, status,
}) {
  const person = await tenantScoped(AuthorizedPickupPerson, schoolId).findByPk(id);
  if (!person) throw new ApiError(404, 'Authorized pickup person not found');

  await person.update({
    fullName: fullName !== undefined ? fullName.trim() : person.fullName,
    relationship: relationship !== undefined ? relationship.trim() : person.relationship,
    phone: phone !== undefined ? (phone?.trim() || null) : person.phone,
    notes: notes !== undefined ? (notes?.trim() || null) : person.notes,
    status: status !== undefined ? status : person.status,
  });
  return person;
}

// Multi-day slice of the report — unlike the single-day view (every ACTIVE
// student, including a NOT_IN row for anyone with no activity), a range
// only lists actual gate events: fabricating a NOT_IN row per student per
// day across a whole term would mostly be noise. One row per (student,
// date) that actually has a GateLogRecord, newest first.
async function getDailyReportRange(schoolId, { from, to, search } = {}) {
  const students = await tenantScoped(Student, schoolId).findAll({
    where: { status: 'ACTIVE' },
    order: [['lastName', 'ASC'], ['firstName', 'ASC']],
  });

  const query = (search || '').trim().toLowerCase();
  const filtered = query
    ? students.filter((s) => s.fullName.toLowerCase().includes(query) || s.studentNumber.toLowerCase().includes(query))
    : students;

  const studentById = new Map(filtered.map((s) => [s.id, s]));
  const records = filtered.length > 0
    ? await tenantScoped(GateLogRecord, schoolId).findAll({
      where: { date: { [Op.between]: [from, to] }, studentId: filtered.map((s) => s.id) },
      order: [['date', 'DESC']],
    })
    : [];

  const rows = records.map((record) => {
    const student = studentById.get(record.studentId);
    return {
      id: student.id,
      date: record.date,
      fullName: student.fullName,
      studentNumber: student.studentNumber,
      status: statusFor(record),
      checkedInAt: record.checkedInAt,
      checkedOutAt: record.checkedOutAt,
      checkedOutByName: record.checkedOutByName,
      wasUnauthorizedPickup: record.wasUnauthorizedPickup,
    };
  });

  const summary = {
    from,
    to,
    totalStudents: rows.length,
    checkedIn: rows.filter((r) => r.status !== 'NOT_IN').length,
    checkedOut: rows.filter((r) => r.status === 'CHECKED_OUT').length,
    notYetPickedUp: rows.filter((r) => r.status === 'CHECKED_IN').length,
    unauthorizedPickups: rows.filter((r) => r.wasUnauthorizedPickup).length,
  };

  return { summary, students: rows };
}

// Whole-school daily report for admin/front-desk oversight — every ACTIVE
// student's status for the day plus summary counts, same shape as
// attendance's getDailyOverview. A single day (the default, or from === to)
// keeps the full-roster view so front desk can still see who never showed
// up; a real range (from < to) switches to getDailyReportRange's
// events-only view instead.
async function getDailyReport(schoolId, {
  date, from, to, search,
} = {}) {
  const startDate = from || date || todayIso();
  const endDate = to || date || todayIso();

  if (startDate === endDate) {
    const rows = await getStudentsWithGateStatus(schoolId, { date: startDate, search });

    const summary = {
      from: startDate,
      to: endDate,
      totalStudents: rows.length,
      checkedIn: rows.filter((r) => r.status !== 'NOT_IN').length,
      checkedOut: rows.filter((r) => r.status === 'CHECKED_OUT').length,
      notYetPickedUp: rows.filter((r) => r.status === 'CHECKED_IN').length,
      unauthorizedPickups: rows.filter((r) => r.wasUnauthorizedPickup).length,
    };

    return { summary, students: rows };
  }

  return getDailyReportRange(schoolId, { from: startDate, to: endDate, search });
}

async function getGateLogSettings(schoolId) {
  const school = await School.findByPk(schoolId, { attributes: ['id', 'gateLogDismissalTime'] });
  if (!school) throw new ApiError(404, 'School not found');
  return { dismissalTime: school.gateLogDismissalTime };
}

async function updateGateLogSettings(schoolId, { dismissalTime }) {
  const school = await School.findByPk(schoolId, { attributes: ['id', 'gateLogDismissalTime'] });
  if (!school) throw new ApiError(404, 'School not found');

  if (dismissalTime !== undefined) school.gateLogDismissalTime = dismissalTime;
  await school.save();

  return { dismissalTime: school.gateLogDismissalTime };
}

// Grace window after a school's own configured dismissal time before a
// still-not-picked-up student gets flagged — a fixed code constant (not a
// second admin setting) to keep this simple.
const GRACE_MINUTES = 30;

function addMinutesToHHMM(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const outH = Math.floor(wrapped / 60);
  const outM = wrapped % 60;
  return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
}

// Ghana (Africa/Accra) is UTC+0 year-round, no DST — so the server clock's
// UTC wall-time components are already Accra wall-time components, no
// timezone conversion/Intl dependency needed.
function nowHHMMInAccra() {
  const now = new Date();
  return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
}

// One school's slice of the missed-pickup sweep — flags any student checked
// in today, not yet checked out, past this school's own dismissal time +
// grace. Self-dismissal-authorized students are excluded at the query level
// (not just hidden in the UI) — there's no adult pickup to be "missed" for
// them. `alertSentAt` is the idempotency guard: once set, a row is never
// re-picked-up by a later run of the same day's sweep.
async function runMissedPickupSweepForSchool(schoolId) {
  const school = await School.findByPk(schoolId, { attributes: ['id', 'gateLogDismissalTime'] });
  if (!school) return { alerted: 0 };

  const threshold = addMinutesToHHMM(school.gateLogDismissalTime, GRACE_MINUTES);
  if (nowHHMMInAccra() < threshold) return { alerted: 0 };

  const day = todayIso();
  const records = await tenantScoped(GateLogRecord, schoolId).findAll({
    where: {
      date: day, checkedInAt: { [Op.ne]: null }, checkedOutAt: null, alertSentAt: null,
    },
    include: [{ model: Student, where: { selfDismissalAuthorized: false } }],
  });

  let alerted = 0;
  for (const record of records) {
    // eslint-disable-next-line no-await-in-loop
    await notifyRoles(schoolId, ['SCHOOL_ADMIN', 'ADMINISTRATOR'], {
      type: 'GATE_LOG_NOT_PICKED_UP',
      title: "A student hasn't been picked up yet",
      body: `${record.Student.fullName} was checked in today but hasn't been checked out.`,
      linkUrl: '/admin/gate-log/today',
    });
    // eslint-disable-next-line no-await-in-loop
    await record.update({ alertSentAt: new Date() });
    alerted += 1;
  }
  return { alerted };
}

async function runMissedPickupSweep() {
  const schools = await School.findAll({
    where: { status: { [Op.in]: ['trial', 'active'] } },
    attributes: ['id'],
  });

  const results = { schoolsProcessed: 0, alerted: 0, errors: 0 };
  for (const school of schools) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { alerted } = await runMissedPickupSweepForSchool(school.id);
      results.schoolsProcessed += 1;
      results.alerted += alerted;
    } catch (err) {
      results.errors += 1;
    }
  }
  return results;
}

module.exports = {
  getStudentsWithGateStatus,
  verifyScan,
  recordCheckIn,
  recordCheckOut,
  getAuthorizedPickupPersons,
  addAuthorizedPickupPerson,
  updateAuthorizedPickupPerson,
  getDailyReport,
  getGateLogSettings,
  updateGateLogSettings,
  runMissedPickupSweep,
};
