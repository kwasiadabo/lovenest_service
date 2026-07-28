const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // some browsers send this for .csv/.xls
  'text/csv',
  'application/csv',
]);
const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5MB

// Buffered in memory, not written to local disk — parsed straight from the
// buffer by dataImport/service.js, same pattern as upload.js/studentPhoto.js.
const uploadImportFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new ApiError(400, 'File must be an Excel (.xlsx) or CSV (.csv) spreadsheet'));
    }
    return cb(null, true);
  },
}).single('file');

module.exports = { uploadImportFile };
