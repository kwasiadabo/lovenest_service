const onboardingService = require('./service');
const { uploadImageBuffer } = require('../../lib/cloudinary');

// Multipart form fields arrive as strings even when left blank; treat blank
// optional fields as unset rather than storing empty strings.
function orUndefined(value) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

async function uploadedLogoUrl(req) {
  if (!req.file) return undefined;
  const result = await uploadImageBuffer(req.file.buffer, { folder: 'school-logos' });
  return result.secure_url;
}

async function registerSchool(req, res, next) {
  try {
    const logoUrl = await uploadedLogoUrl(req);
    const {
      name, code, address, phone, email, adminEmail, adminPassword,
      smsSenderId, emailUser, emailAppPassword, studentPopulation,
      trainingMode, trainingAttendeeCount,
    } = req.body;
    const result = await onboardingService.registerSchool({
      name,
      code,
      address: orUndefined(address),
      phone: orUndefined(phone),
      email: orUndefined(email),
      logoUrl,
      adminEmail,
      adminPassword,
      smsSenderId: orUndefined(smsSenderId),
      emailUser: orUndefined(emailUser),
      emailAppPassword: orUndefined(emailAppPassword),
      studentPopulation: Number(studentPopulation),
      trainingMode,
      trainingAttendeeCount: Number(trainingAttendeeCount),
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { registerSchool };
