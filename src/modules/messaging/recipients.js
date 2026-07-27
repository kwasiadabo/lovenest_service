const {
  StudentClassAssignment, Student, Class, Level, StudentParent, Parent, Staff, AcademicYear,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');

// SMS goes to each student's Emergency Contact phone (a required field,
// always present, and often more reliably kept up to date than a Parent
// record's phone) rather than a linked Parent's phone. Email still goes to
// the linked Parent(s)' address(es), since Student has no emergency-contact
// email field. Recipients are deduped by emergency-contact phone number —
// siblings who share one emergency contact collapse into a single SMS
// (a broadcast shouldn't text the same number twice), with every matching
// student's parents' emails merged into that same row so email still
// reaches each parent.
async function resolveParentRecipients(schoolId, {
  levelId, classId, studentIds,
} = {}) {
  const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  if (!currentYear) return [];

  const classInclude = levelId
    ? { model: Class, where: { levelId }, include: [Level] }
    : { model: Class, include: [Level] };

  const assignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
    where: { academicYearId: currentYear.id, ...(classId ? { classId } : {}) },
    include: [
      classInclude,
      { model: Student, where: { status: 'ACTIVE', ...(studentIds ? { id: studentIds } : {}) } },
    ],
  });
  if (assignments.length === 0) return [];

  const students = assignments.map((a) => a.Student);

  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId: students.map((s) => s.id) },
    include: [Parent],
  });
  const emailsByStudentId = new Map();
  for (const link of links) {
    if (!link.Parent.email) continue;
    const emails = emailsByStudentId.get(link.studentId) || new Set();
    emails.add(link.Parent.email);
    emailsByStudentId.set(link.studentId, emails);
  }

  const byPhone = new Map();
  for (const student of students) {
    const phone = student.emergencyContactPhone;
    const key = phone || `no-contact-${student.id}`;
    const entry = byPhone.get(key) || {
      key,
      name: student.emergencyContactName || student.fullName,
      phone: phone || null,
      emails: new Set(),
    };
    (emailsByStudentId.get(student.id) || []).forEach((email) => entry.emails.add(email));
    byPhone.set(key, entry);
  }

  // `key` is a stable per-row identifier the frontend can select/deselect
  // by (a Compose recipient row has no single backing record — it's an
  // aggregated phone+emails bundle — so there's no natural `id` otherwise).
  return [...byPhone.values()].map((entry) => ({
    key: entry.key,
    type: 'PARENT',
    name: entry.name,
    phone: entry.phone,
    email: entry.emails.size > 0 ? [...entry.emails].join(', ') : null,
  }));
}

// Staff, optionally narrowed to teaching/non-teaching — the coarse
// self-declared staffType field, not a precise class/subject-assignment
// query (see plan: "Teacher targeting" decision).
async function resolveTeacherRecipients(schoolId, { staffType } = {}) {
  const staff = await tenantScoped(Staff, schoolId).findAll({
    where: staffType ? { staffType } : undefined,
    order: [['fullName', 'ASC']],
  });
  return staff.map((s) => ({
    key: s.id, id: s.id, type: 'STAFF', name: s.fullName, phone: s.phone, email: s.email,
  }));
}

module.exports = { resolveParentRecipients, resolveTeacherRecipients };
