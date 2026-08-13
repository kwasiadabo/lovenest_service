const { Op } = require('sequelize');
const { School, Student } = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const studentsService = require('../students/service');

async function resolveSchoolByCode(schoolCode) {
  const school = await School.findOne({
    where: { code: (schoolCode || '').toUpperCase(), status: { [Op.ne]: 'suspended' } },
  });
  if (!school) throw new ApiError(404, 'School not found');
  return school;
}

// Public, unauthenticated — just the display fields the branded login page
// and this apply page itself need (name/logo/brand colors), never anything
// else on School. Used instead of a hardcoded frontend constant so a
// school-admin's own branding edits (schoolSettings module) show up here
// without a frontend deploy.
async function getPublicSchoolInfo(schoolCode) {
  const school = await resolveSchoolByCode(schoolCode);
  return {
    name: school.name,
    code: school.code,
    logoUrl: school.logoUrl,
    brandColor: school.brandColor,
    brandColorSecondary: school.brandColorSecondary,
  };
}

function requireApplicationFields({
  firstName, lastName, gender, dateOfBirth, father, mother, emergencyContactName, emergencyContactPhone,
}) {
  if (!firstName) throw new ApiError(400, 'firstName is required');
  if (!lastName) throw new ApiError(400, 'lastName is required');
  if (!gender || !['MALE', 'FEMALE'].includes(gender)) throw new ApiError(400, 'gender must be MALE or FEMALE');
  if (!dateOfBirth) throw new ApiError(400, 'dateOfBirth is required');
  const hasFather = father?.name && father?.phone;
  const hasMother = mother?.name && mother?.phone;
  if (!hasFather && !hasMother) throw new ApiError(400, 'At least one parent/guardian (name and phone) is required');
  if (!emergencyContactName) throw new ApiError(400, 'emergencyContactName is required');
  if (!emergencyContactPhone) throw new ApiError(400, 'emergencyContactPhone is required');
}

// Public entry point to the admissions pipeline — creates a real Student row
// (reusing studentsService.createStudent for student-number generation and
// father/mother Parent linking, the exact same building block the staff-side
// AdmissionPage wizard uses) but tagged applicantStatus: 'APPLIED', which
// keeps it out of every normal student list until a staff member accepts it
// (see acceptApplicant below). admissionDate is a placeholder (today) —
// nothing downstream reads it until the student is accepted and moves
// through the wizard's own steps.
async function submitPublicApplication(schoolCode, data, photoUrl) {
  const school = await resolveSchoolByCode(schoolCode);
  requireApplicationFields(data);

  const {
    firstName, middleName, lastName, gender, dateOfBirth, address, allergies,
    father, mother, emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
    applicantSelfPhone, applicantSelfEmail, desiredClassLabel, applicationNotes,
  } = data;

  const student = await studentsService.createStudent(school.id, {
    firstName,
    middleName: middleName || undefined,
    lastName,
    gender,
    dateOfBirth,
    address: address || undefined,
    allergies: allergies || undefined,
    admissionDate: new Date().toISOString().slice(0, 10),
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship: emergencyContactRelationship || undefined,
    father,
    mother,
    applicantStatus: 'APPLIED',
    applicantSelfPhone: applicantSelfPhone || null,
    applicantSelfEmail: applicantSelfEmail || null,
    desiredClassLabel: desiredClassLabel || null,
    applicationNotes: applicationNotes || null,
    applicationSubmittedAt: new Date(),
  }, photoUrl);

  return { id: student.id, studentNumber: student.studentNumber };
}

async function listApplicants(schoolId, { stage } = {}) {
  const stages = stage ? [stage] : ['APPLIED', 'SHORTLISTED', 'REJECTED'];
  const students = await tenantScoped(Student, schoolId).findAll({
    where: { applicantStatus: { [Op.in]: stages } },
    order: [['applicationSubmittedAt', 'DESC']],
  });
  return studentsService.attachParents(schoolId, students);
}

async function getApplicant(schoolId, id) {
  const student = await tenantScoped(Student, schoolId).findOne({
    where: { id, applicantStatus: { [Op.not]: null } },
  });
  if (!student) throw new ApiError(404, 'Applicant not found');
  return student;
}

async function shortlistApplicant(schoolId, id) {
  const student = await getApplicant(schoolId, id);
  if (student.applicantStatus !== 'APPLIED') {
    throw new ApiError(409, 'Only a newly submitted application can be shortlisted');
  }
  student.applicantStatus = 'SHORTLISTED';
  await student.save();
  return student;
}

async function rejectApplicant(schoolId, id, notes) {
  const student = await getApplicant(schoolId, id);
  if (student.applicantStatus === 'ACCEPTED') {
    throw new ApiError(409, 'This applicant has already been accepted');
  }
  student.applicantStatus = 'REJECTED';
  if (notes) student.applicationNotes = notes;
  await student.save();
  return student;
}

// The entire "conversion" into a real admission: applicantStatus becomes
// 'ACCEPTED' (a permanent marker, not cleared to null — see models/
// student.js), which both keeps the student visible in every normal list
// from here on and lets a printed offer letter's QR code still verify later.
// admissionStage (students/service.js#admissionStageFor) now computes
// ENROLLED for this row, same as any student the staff wizard just created
// at its own step 1 — so it picks up directly in AdmissionPage's resumable-
// admissions list, at the class-assignment step.
async function acceptApplicant(schoolId, id) {
  const student = await getApplicant(schoolId, id);
  if (student.applicantStatus === 'REJECTED') {
    throw new ApiError(409, 'This applicant was already rejected');
  }
  student.applicantStatus = 'ACCEPTED';
  await student.save();
  return student;
}

// Public, narrow — same trust model as reportCards' getPublicVerification:
// the applicant's own id is the credential, and only enough is returned to
// confirm a printed offer letter is genuine, not the full student record.
async function getPublicApplicantVerification(id) {
  const student = await Student.findByPk(id, {
    include: [{ model: School, attributes: ['id', 'name', 'logoUrl'] }],
  });
  if (!student || student.applicantStatus !== 'ACCEPTED') {
    throw new ApiError(404, 'No accepted application matches this code.');
  }
  return {
    schoolName: student.School?.name || null,
    schoolLogoUrl: student.School?.logoUrl || null,
    studentFullName: student.fullName,
    studentNumber: student.studentNumber,
  };
}

module.exports = {
  submitPublicApplication,
  listApplicants,
  shortlistApplicant,
  rejectApplicant,
  acceptApplicant,
  getPublicApplicantVerification,
  getPublicSchoolInfo,
};
