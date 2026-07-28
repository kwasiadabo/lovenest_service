// Single source of truth for each import type's spreadsheet shape — used to
// both generate the downloadable template (service.js#generateTemplate) and
// map uploaded header rows back to field keys (parsers/*.js), so the two
// can never drift apart.

const STUDENTS_COLUMNS = [
  { header: 'First Name', key: 'firstName', required: true, example: 'Ama' },
  { header: 'Middle Name', key: 'middleName', required: false, example: '' },
  { header: 'Last Name', key: 'lastName', required: true, example: 'Owusu' },
  { header: 'Gender (MALE/FEMALE)', key: 'gender', required: true, example: 'FEMALE' },
  { header: 'Date of Birth (YYYY-MM-DD)', key: 'dateOfBirth', required: true, example: '2016-03-12' },
  { header: 'Admission Date (YYYY-MM-DD)', key: 'admissionDate', required: true, example: '2026-01-15' },
  { header: 'Class (optional, e.g. 4A)', key: 'className', required: false, example: '' },
  { header: 'Allergies', key: 'allergies', required: false, example: '' },
  { header: 'Home Address', key: 'address', required: false, example: '' },
  { header: "Father's Name", key: 'fatherName', required: false, example: 'Kwame Owusu' },
  { header: "Father's Phone", key: 'fatherPhone', required: false, example: '0244000000' },
  { header: "Father's Email", key: 'fatherEmail', required: false, example: '' },
  { header: "Mother's Name", key: 'motherName', required: false, example: '' },
  { header: "Mother's Phone", key: 'motherPhone', required: false, example: '' },
  { header: "Mother's Email", key: 'motherEmail', required: false, example: '' },
  { header: 'Emergency Contact Name', key: 'emergencyContactName', required: true, example: 'Kwame Owusu' },
  { header: 'Emergency Contact Phone', key: 'emergencyContactPhone', required: true, example: '0244000000' },
  { header: 'Emergency Contact Relationship', key: 'emergencyContactRelationship', required: false, example: 'Father' },
];

// studentNumber/firstName+lastName+dateOfBirth are alternative ways to
// identify an existing student — shared by fee-balances and transport,
// which both operate on students that already exist (imported and
// confirmed in a prior Students import, or entered directly).
const STUDENT_MATCH_COLUMNS = [
  { header: 'Student Number (preferred if known)', key: 'studentNumber', required: false, example: '' },
  { header: 'First Name (if no Student Number)', key: 'firstName', required: false, example: 'Ama' },
  { header: 'Last Name (if no Student Number)', key: 'lastName', required: false, example: 'Owusu' },
  { header: 'Date of Birth (if no Student Number, YYYY-MM-DD)', key: 'dateOfBirth', required: false, example: '2016-03-12' },
];

const FEE_BALANCES_COLUMNS = [
  ...STUDENT_MATCH_COLUMNS,
  { header: 'Outstanding Balance (GHS)', key: 'balanceAmountCedis', required: true, example: '450.00' },
];

const TRANSPORT_SUBSCRIBERS_COLUMNS = [
  ...STUDENT_MATCH_COLUMNS,
  { header: 'Vehicle Name', key: 'vehicleName', required: true, example: 'Bus 1' },
  { header: 'Pickup Point (optional)', key: 'pickupPointName', required: false, example: '' },
  { header: 'Billing Cycle (TERMLY/MONTHLY)', key: 'billingCycle', required: true, example: 'TERMLY' },
  { header: 'Start Date (YYYY-MM-DD)', key: 'startDate', required: true, example: '2026-01-15' },
];

const COLUMNS_BY_TYPE = {
  STUDENTS: STUDENTS_COLUMNS,
  FEE_BALANCES: FEE_BALANCES_COLUMNS,
  TRANSPORT_SUBSCRIBERS: TRANSPORT_SUBSCRIBERS_COLUMNS,
};

module.exports = { COLUMNS_BY_TYPE };
