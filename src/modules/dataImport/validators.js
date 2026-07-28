const ApiError = require('../../utils/ApiError');
const { COLUMNS_BY_TYPE } = require('./columns');

function validateImportType(req, res, next) {
  const { type } = req.params;
  if (!COLUMNS_BY_TYPE[type]) {
    return next(new ApiError(400, `type must be one of: ${Object.keys(COLUMNS_BY_TYPE).join(', ')}`));
  }
  return next();
}

function validateFilePresent(req, res, next) {
  if (!req.file) return next(new ApiError(400, 'A file is required'));
  return next();
}

module.exports = { validateImportType, validateFilePresent };
