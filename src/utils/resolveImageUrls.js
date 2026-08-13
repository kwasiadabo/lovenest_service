const { uploadImageBuffer } = require('../lib/cloudinary');

// Combines the previously-uploaded images a PATCH wants to keep
// (req.body.keepImageUrls, a JSON-stringified array of urls — see frontend's
// announcements/sermons api.js#toFormData) with any newly-picked files
// (req.files, from multiImageUpload's `.array('images', ...)`), uploading
// the new ones to Cloudinary. A plain POST simply sends no keepImageUrls, so
// this also works unchanged for create.
async function resolveImageUrls(req, folder) {
  const keep = req.body.keepImageUrls ? JSON.parse(req.body.keepImageUrls) : [];
  const files = req.files || [];
  const uploaded = await Promise.all(files.map((file) => uploadImageBuffer(file.buffer, { folder })));
  return [...keep, ...uploaded.map((result) => result.secure_url)];
}

module.exports = resolveImageUrls;
