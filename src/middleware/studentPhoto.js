const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3MB

// Buffered in memory, not written to local disk — the buffer is streamed
// straight to Cloudinary from the controller.
const uploadStudentPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new ApiError(400, 'Photo must be a PNG, JPEG, or WebP image'));
    }
    return cb(null, true);
  },
}).single('photo');

module.exports = { uploadStudentPhoto };
