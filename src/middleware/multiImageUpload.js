const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB
const MAX_IMAGES = 6;

// Same buffered-in-memory posture as studentPhoto.js, just `.array()`
// instead of `.single()` — used by announcements/sermons, both of which
// accept up to MAX_IMAGES images per record under the repeated `images`
// field name (see frontend's MultiImagePicker).
const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new ApiError(400, 'Images must be PNG, JPEG, or WebP'));
    }
    return cb(null, true);
  },
}).array('images', MAX_IMAGES);

module.exports = { uploadImages, MAX_IMAGES };
