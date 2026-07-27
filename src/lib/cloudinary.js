// The Cloudinary SDK auto-configures itself from process.env.CLOUDINARY_URL
// (set in .env) the first time this module is required — no explicit
// cloudinary.config() call needed.
const cloudinary = require('cloudinary').v2;

function uploadImageBuffer(buffer, { folder }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadImageBuffer };
