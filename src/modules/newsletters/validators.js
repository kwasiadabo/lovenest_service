const ApiError = require('../../utils/ApiError');

function validateNewsletter(req, res, next) {
  const { title, body, publishedAt } = req.body;
  if (!title || !title.trim()) return next(new ApiError(400, 'Title is required'));
  if (!body || !body.trim()) return next(new ApiError(400, 'Body is required'));
  if (publishedAt && Number.isNaN(Date.parse(publishedAt))) {
    return next(new ApiError(400, 'publishedAt must be a valid date'));
  }
  return next();
}

module.exports = { validateNewsletter };
