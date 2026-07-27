const ApiError = require('../../utils/ApiError');

function validateAnnouncement(req, res, next) {
  const { title, body } = req.body;
  if (!title || !title.trim()) return next(new ApiError(400, 'Title is required'));
  if (!body || !body.trim()) return next(new ApiError(400, 'Body is required'));
  return next();
}

module.exports = { validateAnnouncement };
