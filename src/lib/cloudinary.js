// The Cloudinary SDK auto-configures itself from process.env.CLOUDINARY_URL
// (set in .env) the first time this module is required — no explicit
// cloudinary.config() call needed.
const cloudinary = require('cloudinary').v2;

// Generalized upload — `resourceType` defaults to 'auto' so Cloudinary picks
// the right handling for whatever comes in (images, PDFs, etc.), unlike
// uploadImageBuffer below which always forces 'image'.
function uploadFileBuffer(buffer, { folder, resourceType = 'auto' }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

// Thin wrapper kept for the two existing image-only callers (school logo,
// student photo) — unaffected by the generalization above.
function uploadImageBuffer(buffer, { folder }) {
  return uploadFileBuffer(buffer, { folder, resourceType: 'image' });
}

module.exports = { cloudinary, uploadImageBuffer, uploadFileBuffer };
