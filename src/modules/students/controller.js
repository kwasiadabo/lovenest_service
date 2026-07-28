const studentsService = require('./service');
const { getStudentFullHistory } = require('./fullHistory');
const { uploadImageBuffer } = require('../../lib/cloudinary');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function uploadedPhotoUrl(req) {
  if (!req.file) return undefined;
  const result = await uploadImageBuffer(req.file.buffer, { folder: 'student-photos' });
  return result.secure_url;
}

// Multipart form fields arrive as strings even when left blank; treat blank
// optional fields as unset rather than storing empty strings.
function orUndefined(value) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function studentPayload(body) {
  const {
    firstName, middleName, lastName, gender, dateOfBirth, allergies, address, admissionDate,
    fatherName, fatherPhone, fatherEmail,
    motherName, motherPhone, motherEmail,
    emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
  } = body;
  return {
    firstName,
    middleName: orUndefined(middleName),
    lastName,
    gender,
    dateOfBirth,
    allergies: orUndefined(allergies),
    address: orUndefined(address),
    admissionDate,
    father: { name: orUndefined(fatherName), phone: orUndefined(fatherPhone), email: orUndefined(fatherEmail) },
    mother: { name: orUndefined(motherName), phone: orUndefined(motherPhone), email: orUndefined(motherEmail) },
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship: orUndefined(emergencyContactRelationship),
  };
}

const listStudents = wrap(async (req, res) => {
  res.json(await studentsService.listStudents(req.schoolId, { status: req.query.status }));
});

const createStudent = wrap(async (req, res) => {
  const photoUrl = await uploadedPhotoUrl(req);
  res.status(201).json(await studentsService.createStudent(req.schoolId, studentPayload(req.body), photoUrl));
});

const updateStudent = wrap(async (req, res) => {
  const photoUrl = await uploadedPhotoUrl(req);
  res.json(await studentsService.updateStudent(req.schoolId, req.params.id, studentPayload(req.body), photoUrl));
});

const setStudentStatus = wrap(async (req, res) => {
  res.json(await studentsService.setStudentStatus(req.schoolId, req.params.id, req.body));
});

const setStudentDiscount = wrap(async (req, res) => {
  res.json(await studentsService.setStudentDiscount(req.schoolId, req.params.id, req.body));
});

const recordAdmissionPayment = wrap(async (req, res) => {
  res.status(201).json(
    await studentsService.recordAdmissionPayment(req.schoolId, req.params.id, req.auth.userId, req.body),
  );
});

const listClassAssignments = wrap(async (req, res) => {
  res.json(await studentsService.listClassAssignments(req.schoolId, req.query));
});

const assignStudentToClass = wrap(async (req, res) => {
  res.status(201).json(await studentsService.assignStudentToClass(req.schoolId, req.body));
});

const removeClassAssignment = wrap(async (req, res) => {
  await studentsService.removeClassAssignment(req.schoolId, req.params.id);
  res.status(204).send();
});

const promoteStudents = wrap(async (req, res) => {
  res.json(await studentsService.promoteStudents(req.schoolId, req.body));
});

const getPromotionPreview = wrap(async (req, res) => {
  res.json(await studentsService.getPromotionPreview(req.schoolId));
});

const confirmPromotion = wrap(async (req, res) => {
  res.status(201).json(await studentsService.confirmPromotion(req.schoolId, req.auth.userId, req.body));
});

const graduateStudents = wrap(async (req, res) => {
  res.json(await studentsService.graduateStudents(req.schoolId, req.body));
});

const listPromotionBatches = wrap(async (req, res) => {
  res.json(await studentsService.listPromotionBatches(req.schoolId));
});

const getPromotionBatchDetail = wrap(async (req, res) => {
  res.json(await studentsService.getPromotionBatchDetail(req.schoolId, req.params.id));
});

const createParentLogin = wrap(async (req, res) => {
  const { id: studentId, relationship } = req.params;
  res.status(201).json(await studentsService.createParentLogin(req.schoolId, studentId, relationship));
});

const resetParentLoginPassword = wrap(async (req, res) => {
  const { id: studentId, relationship } = req.params;
  res.json(await studentsService.resetParentLoginPassword(req.schoolId, studentId, relationship));
});

const getUpcomingBirthdays = wrap(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : undefined;
  res.json(await studentsService.getUpcomingBirthdays(req.schoolId, req.auth.userId, req.auth.roles, { days }));
});

const sendBirthdayMessage = wrap(async (req, res) => {
  res.status(201).json(
    await studentsService.sendBirthdayMessage(req.schoolId, req.auth.userId, req.auth.roles, req.params.id, req.body),
  );
});

const getFullHistory = wrap(async (req, res) => {
  res.json(await getStudentFullHistory(req.schoolId, req.auth.roles, req.params.id));
});

const getAdmissionPaymentsReport = wrap(async (req, res) => {
  const {
    from, to, levelId, classId,
  } = req.query;
  res.json(await studentsService.getAdmissionPaymentsReport(req.schoolId, {
    from, to, levelId, classId,
  }));
});

module.exports = {
  listStudents,
  createStudent,
  updateStudent,
  setStudentStatus,
  setStudentDiscount,
  recordAdmissionPayment,
  listClassAssignments,
  assignStudentToClass,
  removeClassAssignment,
  promoteStudents,
  getPromotionPreview,
  confirmPromotion,
  graduateStudents,
  listPromotionBatches,
  getPromotionBatchDetail,
  createParentLogin,
  resetParentLoginPassword,
  getUpcomingBirthdays,
  sendBirthdayMessage,
  getFullHistory,
  getAdmissionPaymentsReport,
};
