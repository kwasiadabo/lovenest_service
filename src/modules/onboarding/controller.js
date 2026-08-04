const onboardingService = require('./service');
const paymentService = require('./paymentService');
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

function readRegistrationFields(req, logoUrl) {
  const {
    name, code, address, phone, email, adminEmail, adminPassword,
    smsSenderId, emailUser, emailAppPassword, studentPopulation,
    trainingMode, trainingAttendeeCount, academicYearName, termSequence,
  } = req.body;
  return {
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
    academicYearName: academicYearName ? String(academicYearName).trim() : undefined,
    termSequence: termSequence ? Number(termSequence) : undefined,
  };
}

async function registerSchool(req, res, next) {
  try {
    const logoUrl = await uploadedLogoUrl(req);
    const result = await onboardingService.registerSchool(readRegistrationFields(req, logoUrl));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function initializePayment(req, res, next) {
  try {
    const logoUrl = await uploadedLogoUrl(req);
    const result = await paymentService.initializeRegistrationPayment(readRegistrationFields(req, logoUrl));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const pending = await paymentService.verifyRegistrationPayment(req.params.reference);
    res.json({
      status: pending.status,
      email: pending.email,
    });
  } catch (err) {
    next(err);
  }
}

async function listSchools(req, res, next) {
  try {
    const schools = await onboardingService.listPublicSchools();
    res.json(schools);
  } catch (err) {
    next(err);
  }
}

async function getSchoolByCode(req, res, next) {
  try {
    const school = await onboardingService.getPublicSchoolByCode(req.params.code);
    if (!school) return res.status(404).json({ error: 'School not found' });
    return res.json(school);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  registerSchool, initializePayment, verifyPayment, listSchools, getSchoolByCode,
};
