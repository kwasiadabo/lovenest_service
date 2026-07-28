const { cellToString, cellToDateOnly } = require('../parseHelpers');

const GENDERS = ['MALE', 'FEMALE'];

// `context.classByName` is a Map<lowercased class name, Class> for the
// school's current academic year, pre-built once per file by service.js.
function parseStudentRow(row, context) {
  const errors = [];

  const firstName = cellToString(row.firstName);
  const middleName = cellToString(row.middleName);
  const lastName = cellToString(row.lastName);
  const gender = cellToString(row.gender).toUpperCase();
  const dateOfBirth = cellToDateOnly(row.dateOfBirth);
  const admissionDate = cellToDateOnly(row.admissionDate);
  const className = cellToString(row.className);
  const allergies = cellToString(row.allergies);
  const address = cellToString(row.address);
  const fatherName = cellToString(row.fatherName);
  const fatherPhone = cellToString(row.fatherPhone);
  const fatherEmail = cellToString(row.fatherEmail);
  const motherName = cellToString(row.motherName);
  const motherPhone = cellToString(row.motherPhone);
  const motherEmail = cellToString(row.motherEmail);
  const emergencyContactName = cellToString(row.emergencyContactName);
  const emergencyContactPhone = cellToString(row.emergencyContactPhone);
  const emergencyContactRelationship = cellToString(row.emergencyContactRelationship);

  if (!firstName) errors.push('First Name is required');
  if (!lastName) errors.push('Last Name is required');
  if (!gender) errors.push('Gender is required');
  else if (!GENDERS.includes(gender)) errors.push('Gender must be MALE or FEMALE');
  if (!dateOfBirth) errors.push('Date of Birth is required');
  else if (dateOfBirth === undefined) errors.push('Date of Birth is not a valid date');
  if (!admissionDate) errors.push('Admission Date is required');
  else if (admissionDate === undefined) errors.push('Admission Date is not a valid date');

  const hasFather = fatherName && fatherPhone;
  const hasMother = motherName && motherPhone;
  if (!hasFather && !hasMother) {
    errors.push("At least one parent (name and phone, Father's or Mother's) is required");
  }

  if (!emergencyContactName) errors.push('Emergency Contact Name is required');
  if (!emergencyContactPhone) errors.push('Emergency Contact Phone is required');

  let classId;
  if (className) {
    const match = context.classByName.get(className.toLowerCase());
    if (!match) errors.push(`Class "${className}" was not found for the current academic year`);
    else classId = match.id;
  }

  if (errors.length > 0) return { errors };

  return {
    data: {
      firstName,
      middleName: middleName || undefined,
      lastName,
      gender,
      dateOfBirth,
      admissionDate,
      allergies: allergies || undefined,
      address: address || undefined,
      father: { name: fatherName || undefined, phone: fatherPhone || undefined, email: fatherEmail || undefined },
      mother: { name: motherName || undefined, phone: motherPhone || undefined, email: motherEmail || undefined },
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship: emergencyContactRelationship || undefined,
      classId,
    },
  };
}

module.exports = { parseStudentRow };
