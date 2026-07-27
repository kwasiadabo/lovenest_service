const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB

// Buffered in memory, not written to local disk — the buffer is streamed
// straight to Cloudinary from the controller (mirrors studentPhoto.js).
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new ApiError(400, 'Logo must be a PNG, JPEG, WebP, or SVG image'));
    }
    return cb(null, true);
  },
}).single('logo');

module.exports = { uploadLogo };
