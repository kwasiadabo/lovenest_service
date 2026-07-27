const ApiError = require('../../utils/ApiError');

function validateBudget(req, res, next) {
  const { academicYearId, name, lines } = req.body || {};
  if (!academicYearId) return next(new ApiError(400, 'academicYearId is required'));
  if (!name || !name.trim()) return next(new ApiError(400, 'name is required'));
  if (lines !== undefined) {
    if (!Array.isArray(lines)) return next(new ApiError(400, 'lines must be an array'));
    for (const line of lines) {
      if (!line.accountId) return next(new ApiError(400, 'Each line requires an accountId'));
      if (!(Number(line.budgetedAmountPesewas) > 0)) {
        return next(new ApiError(400, 'Each line requires a budgetedAmountPesewas greater than 0'));
      }
    }
  }
  return next();
}

module.exports = { validateBudget };
