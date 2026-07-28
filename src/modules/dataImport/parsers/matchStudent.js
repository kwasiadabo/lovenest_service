const { cellToString, cellToDateOnly } = require('../parseHelpers');

// Shared by fee-balances and transport-subscribers rows, which both
// reference a student that must already exist (typically from a Students
// import that's already been confirmed — this import doesn't create
// students on the fly). `studentIndex` is pre-built once per preview/confirm
// call by service.js: { byNumber: Map<studentNumber, Student>,
// byNameDob: Map<"first|last|dob", Student[]> }.
function matchStudent(row, studentIndex) {
  const studentNumber = cellToString(row.studentNumber);
  if (studentNumber) {
    const student = studentIndex.byNumber.get(studentNumber.toUpperCase());
    if (!student) return { error: `No student found with Student Number "${studentNumber}"` };
    return { student };
  }

  const firstName = cellToString(row.firstName);
  const lastName = cellToString(row.lastName);
  const dateOfBirth = cellToDateOnly(row.dateOfBirth);
  if (!firstName || !lastName || !dateOfBirth) {
    return { error: 'Provide either Student Number, or First Name + Last Name + Date of Birth, to identify the student' };
  }
  if (dateOfBirth === undefined) return { error: 'Date of Birth is not a valid date' };

  const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${dateOfBirth}`;
  const matches = studentIndex.byNameDob.get(key) || [];
  if (matches.length === 0) {
    return { error: `No student found matching "${firstName} ${lastName}" (DOB ${dateOfBirth}) — import the Students sheet first, or use Student Number` };
  }
  if (matches.length > 1) {
    return { error: `Multiple students match "${firstName} ${lastName}" (DOB ${dateOfBirth}) — use Student Number to disambiguate` };
  }
  return { student: matches[0] };
}

module.exports = { matchStudent };
