// The prefix on every student's studentNumber (e.g. "UG" in "UG-2026-004501")
// — 2-3 letters/digits, always stored uppercase so lookups and the printed
// number are never case-sensitive.
const SCHOOL_CODE_PATTERN = /^[A-Z0-9]{2,3}$/;

function normalizeSchoolCode(code) {
  return String(code || '').trim().toUpperCase();
}

function isValidSchoolCode(code) {
  return SCHOOL_CODE_PATTERN.test(code);
}

module.exports = { normalizeSchoolCode, isValidSchoolCode };
