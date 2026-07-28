const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5MB — contracts/certs are often scanned PDFs, bigger than a logo/photo.

// Buffered in memory, not written to local disk — the buffer is streamed
// straight to Cloudinary from the controller. Mirrors studentPhoto.js's
// shape, just with a broader mime allowlist and a bigger size limit.
const uploadStaffDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new ApiError(400, 'Document must be a PDF, PNG, JPEG, or WebP file'));
    }
    return cb(null, true);
  },
}).single('file');

module.exports = { uploadStaffDocument };
