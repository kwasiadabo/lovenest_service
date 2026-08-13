const ApiError = require('../../utils/ApiError');

function validateAnnouncement(req, res, next) {
  const {
    title, body, startDate, endDate,
  } = req.body;
  if (!title || !title.trim()) return next(new ApiError(400, 'Title is required'));
  if (!body || !body.trim()) return next(new ApiError(400, 'Body is required'));
  if (startDate && endDate && startDate > endDate) {
    return next(new ApiError(400, '"Show from" date must be before "Show until" date'));
  }
  return next();
}

module.exports = { validateAnnouncement };
