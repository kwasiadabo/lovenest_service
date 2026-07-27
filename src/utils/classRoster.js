const { Term, Student, StudentClassAssignment } = require('../models');
const tenantScoped = require('./tenantScopedModel');
const ApiError = require('./ApiError');

// Roster is resolved by class + the academic year the given term belongs to
// (StudentClassAssignment only scopes by year, not term), filtered to
// currently-ACTIVE students — shared by assessment/service.js,
// attendance/service.js, and reportCards/service.js so this resolution
// logic lives in exactly one place.
async function resolveRoster(schoolId, classId, termId) {
  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const assignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
    where: { classId, academicYearId: term.academicYearId },
    include: [{ model: Student, where: { status: 'ACTIVE' } }],
    order: [[Student, 'lastName', 'ASC'], [Student, 'firstName', 'ASC']],
  });

  return assignments.map((a) => ({
    id: a.Student.id,
    fullName: a.Student.fullName,
    // Exposed alongside fullName so callers can sort by last name using the
    // real stored field, rather than guessing at it by splitting the
    // "First Middle Last" display string (which breaks on multi-word
    // surnames).
    lastName: a.Student.lastName,
    firstName: a.Student.firstName,
    studentNumber: a.Student.studentNumber,
    // Exposed so the attendance register can flag a student whose birthday
    // falls on the day being marked (see AttendanceRegisterPage).
    dateOfBirth: a.Student.dateOfBirth,
  }));
}

module.exports = { resolveRoster };
