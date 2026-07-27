const multer = require('multer');
const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// Sequelize sets err.message to the literal string "Validation error" for both
// SequelizeValidationError and SequelizeUniqueConstraintError — the actual
// per-field reasons live in err.errors[]. Unwrap those so the client gets
// something like "date must be unique" instead of "Validation error".
function describeSequelizeError(err) {
  if (err.name === 'SequelizeUniqueConstraintError') {
    return { statusCode: 409, message: err.errors?.map((e) => e.message).join('; ') || 'That record already exists.' };
  }
  if (err.name === 'SequelizeValidationError') {
    return { statusCode: 400, message: err.errors?.map((e) => e.message).join('; ') || 'Validation error' };
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return { statusCode: 400, message: 'That references a record that does not exist.' };
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  const sequelizeError = !(err instanceof ApiError) && describeSequelizeError(err);

  const statusCode = sequelizeError ? sequelizeError.statusCode : err instanceof ApiError ? err.statusCode : 500;
  const message = sequelizeError
    ? sequelizeError.message
    : statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  if (statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(statusCode).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };
