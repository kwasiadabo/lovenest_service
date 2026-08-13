const ApiError = require('../../utils/ApiError');

function validateSermon(req, res, next) {
  const { title, body, date } = req.body;
  if (!title || !title.trim()) return next(new ApiError(400, 'Title is required'));
  if (!body || !body.trim()) return next(new ApiError(400, 'Sermon text is required'));
  if (!date) return next(new ApiError(400, 'Featured date is required'));
  return next();
}

module.exports = { validateSermon };
