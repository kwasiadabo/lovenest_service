const service = require('./service');
const { uploadImageBuffer } = require('../../lib/cloudinary');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function uploadedPhotoUrl(req) {
  if (!req.file) return undefined;
  const result = await uploadImageBuffer(req.file.buffer, { folder: 'student-photos' });
  return result.secure_url;
}

// Multipart form fields arrive as strings even when left blank — same
// flattened father*/mother* shape and blank-to-undefined handling as
// students/controller.js#studentPayload, since this hits the same
// createStudent building block under the hood.
function orUndefined(value) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function applicationPayload(body) {
  const {
    firstName, middleName, lastName, gender, dateOfBirth, allergies, address,
    fatherName, fatherPhone, fatherEmail,
    motherName, motherPhone, motherEmail,
    emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
    applicantSelfPhone, applicantSelfEmail, desiredClassLabel, applicationNotes,
  } = body;
  return {
    firstName,
    middleName: orUndefined(middleName),
    lastName,
    gender,
    dateOfBirth,
    allergies: orUndefined(allergies),
    address: orUndefined(address),
    father: { name: orUndefined(fatherName), phone: orUndefined(fatherPhone), email: orUndefined(fatherEmail) },
    mother: { name: orUndefined(motherName), phone: orUndefined(motherPhone), email: orUndefined(motherEmail) },
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship: orUndefined(emergencyContactRelationship),
    applicantSelfPhone: orUndefined(applicantSelfPhone),
    applicantSelfEmail: orUndefined(applicantSelfEmail),
    desiredClassLabel: orUndefined(desiredClassLabel),
    applicationNotes: orUndefined(applicationNotes),
  };
}

const submitApplication = wrap(async (req, res) => {
  const photoUrl = await uploadedPhotoUrl(req);
  const payload = applicationPayload(req.body || {});
  res.status(201).json(await service.submitPublicApplication(req.params.schoolCode, payload, photoUrl));
});

const verifyApplicant = wrap(async (req, res) => {
  res.json(await service.getPublicApplicantVerification(req.params.id));
});

module.exports = { submitApplication, verifyApplicant };
