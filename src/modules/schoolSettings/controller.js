const schoolSettingsService = require('./service');
const { uploadImageBuffer } = require('../../lib/cloudinary');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const getSettings = wrap(async (req, res) => {
  res.json(await schoolSettingsService.getSettings(req.schoolId));
});

const updateSettings = wrap(async (req, res) => {
  res.json(await schoolSettingsService.updateSettings(req.schoolId, req.body));
});

// req.body.remove === 'true' (sent as a plain form field, no file) clears
// the signature; a file sets it; neither present leaves it unchanged.
const updateSignature = wrap(async (req, res) => {
  let signatureUrl;
  if (req.body.remove === 'true') {
    signatureUrl = null;
  } else if (req.file) {
    const result = await uploadImageBuffer(req.file.buffer, { folder: 'headteacher-signatures' });
    signatureUrl = result.secure_url;
  }
  res.json(await schoolSettingsService.updateSignature(req.schoolId, signatureUrl));
});

module.exports = { getSettings, updateSettings, updateSignature };
