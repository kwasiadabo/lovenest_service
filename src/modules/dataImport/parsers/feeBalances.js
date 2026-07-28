const { cedisToPesewas } = require('../parseHelpers');
const { matchStudent } = require('./matchStudent');

// `context.studentIndex` — see matchStudent.js. `context.existingBillStudentIds`
// is a Set<studentId> already billed for the current term, pre-built once
// per file so this stays an O(1) lookup per row instead of a query each time.
function parseFeeBalanceRow(row, context) {
  const errors = [];

  const { student, error: matchError } = matchStudent(row, context.studentIndex);
  if (matchError) errors.push(matchError);

  const { value: balancePesewas, error: amountError } = cedisToPesewas(row.balanceAmountCedis);
  if (amountError) errors.push(`Outstanding Balance ${amountError}`);

  if (student && context.existingBillStudentIds.has(student.id)) {
    errors.push(`${student.firstName} ${student.lastName} already has a bill for the current term — adjust it directly in Fees instead`);
  }

  if (errors.length > 0) return { errors };

  return { data: { studentId: student.id, balancePesewas } };
}

module.exports = { parseFeeBalanceRow };
