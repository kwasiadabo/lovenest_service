const ApiError = require('../../utils/ApiError');

const STATUSES = ['ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED'];
const PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER'];
const RELATIONSHIPS = ['FATHER', 'MOTHER'];
const DISCOUNT_TYPES = ['PERCENT', 'FLAT'];

function validateStudent(req, res, next) {
  const {
    firstName, lastName, gender, dateOfBirth, admissionDate,
    fatherName, fatherPhone, motherName, motherPhone,
    emergencyContactName, emergencyContactPhone,
  } = req.body || {};

  if (!firstName) return next(new ApiError(400, 'firstName is required'));
  if (!lastName) return next(new ApiError(400, 'lastName is required'));
  if (!gender) return next(new ApiError(400, 'gender is required'));
  if (!['MALE', 'FEMALE'].includes(gender)) return next(new ApiError(400, 'gender must be MALE or FEMALE'));
  if (!dateOfBirth) return next(new ApiError(400, 'dateOfBirth is required'));
  if (!admissionDate) return next(new ApiError(400, 'admissionDate is required'));

  const hasFather = fatherName && fatherPhone;
  const hasMother = motherName && motherPhone;
  if (!hasFather && !hasMother) {
    return next(new ApiError(400, 'At least one parent (name and phone) is required'));
  }

  if (!emergencyContactName) return next(new ApiError(400, 'emergencyContactName is required'));
  if (!emergencyContactPhone) return next(new ApiError(400, 'emergencyContactPhone is required'));

  return next();
}

function validateStudentStatus(req, res, next) {
  const { status } = req.body || {};
  if (!status) return next(new ApiError(400, 'status is required'));
  if (!STATUSES.includes(status)) return next(new ApiError(400, `status must be one of: ${STATUSES.join(', ')}`));
  return next();
}

function validateAdmissionPayment(req, res, next) {
  const {
    items, method, paidDate, cashAccountId,
  } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return next(new ApiError(400, 'items is required and must be a non-empty array of { feeTypeId, amountPesewas }'));
  }
  for (const item of items) {
    if (!item.feeTypeId) return next(new ApiError(400, 'each item must have a feeTypeId'));
    if (item.amountPesewas === undefined || item.amountPesewas === null || Number.isNaN(Number(item.amountPesewas)) || Number(item.amountPesewas) <= 0) {
      return next(new ApiError(400, 'each item must have an amountPesewas greater than 0'));
    }
  }
  if (!method) return next(new ApiError(400, 'method is required'));
  if (!PAYMENT_METHODS.includes(method)) return next(new ApiError(400, `method must be one of: ${PAYMENT_METHODS.join(', ')}`));
  if (!paidDate) return next(new ApiError(400, 'paidDate is required'));
  if (!cashAccountId) return next(new ApiError(400, 'cashAccountId is required — which cash/bank/mobile-money account received this payment'));
  return next();
}

function validateClassAssignment(req, res, next) {
  const { studentId, classId } = req.body || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!classId) return next(new ApiError(400, 'classId is required'));
  return next();
}

function validatePromotion(req, res, next) {
  const { fromClassId, fromAcademicYearId, toClassId, toAcademicYearId } = req.body || {};
  if (!fromClassId) return next(new ApiError(400, 'fromClassId is required'));
  if (!fromAcademicYearId) return next(new ApiError(400, 'fromAcademicYearId is required'));
  if (!toClassId) return next(new ApiError(400, 'toClassId is required'));
  if (!toAcademicYearId) return next(new ApiError(400, 'toAcademicYearId is required'));
  return next();
}

function validateConfirmPromotion(req, res, next) {
  const { studentIds } = req.body || {};
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return next(new ApiError(400, 'studentIds is required and must be a non-empty array'));
  }
  return next();
}

function validateGraduateStudents(req, res, next) {
  const { studentIds, statusDate } = req.body || {};
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return next(new ApiError(400, 'studentIds is required and must be a non-empty array'));
  }
  if (!statusDate) return next(new ApiError(400, 'statusDate is required'));
  return next();
}

// A null/absent discountType clears the discount and needs nothing else —
// only a PERCENT or FLAT type requires its matching value to be checked.
function validateStudentDiscount(req, res, next) {
  const {
    discountType, discountPercent, discountFlatPesewas, discountReason,
  } = req.body || {};

  if (!discountType) return next();

  if (!DISCOUNT_TYPES.includes(discountType)) {
    return next(new ApiError(400, `discountType must be one of: ${DISCOUNT_TYPES.join(', ')}`));
  }
  if (discountType === 'PERCENT') {
    const num = Number(discountPercent);
    if (Number.isNaN(num) || num <= 0 || num > 100) {
      return next(new ApiError(400, 'discountPercent must be a number between 0 and 100'));
    }
  }
  if (discountType === 'FLAT') {
    const num = Number(discountFlatPesewas);
    if (Number.isNaN(num) || num <= 0) {
      return next(new ApiError(400, 'discountFlatPesewas must be a positive number'));
    }
  }
  if (discountReason !== undefined && discountReason !== null && typeof discountReason !== 'string') {
    return next(new ApiError(400, 'discountReason must be a string'));
  }
  return next();
}

function validateRelationshipParam(req, res, next) {
  const { relationship } = req.params || {};
  if (!RELATIONSHIPS.includes(relationship)) {
    return next(new ApiError(400, `relationship must be one of: ${RELATIONSHIPS.join(', ')}`));
  }
  return next();
}

function validateBirthdayMessage(req, res, next) {
  const { message, smsRequested, emailRequested } = req.body || {};
  if (!smsRequested && !emailRequested) {
    return next(new ApiError(400, 'Select at least one channel (SMS or email)'));
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return next(new ApiError(400, 'message is required'));
  }
  return next();
}

function validateSelfDismissal(req, res, next) {
  const { selfDismissalAuthorized, selfDismissalNote } = req.body || {};
  if (typeof selfDismissalAuthorized !== 'boolean') {
    return next(new ApiError(400, 'selfDismissalAuthorized must be true or false'));
  }
  if (selfDismissalNote !== undefined && selfDismissalNote !== null && typeof selfDismissalNote !== 'string') {
    return next(new ApiError(400, 'selfDismissalNote must be a string'));
  }
  if (selfDismissalNote && selfDismissalNote.trim().length > 200) {
    return next(new ApiError(400, 'selfDismissalNote must be 200 characters or fewer'));
  }
  return next();
}

module.exports = {
  validateStudent,
  validateStudentStatus,
  validateStudentDiscount,
  validateAdmissionPayment,
  validateClassAssignment,
  validatePromotion,
  validateConfirmPromotion,
  validateGraduateStudents,
  validateRelationshipParam,
  validateBirthdayMessage,
  validateSelfDismissal,
};
