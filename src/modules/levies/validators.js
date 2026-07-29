const ApiError = require('../../utils/ApiError');
const { Levy, LevyPayment } = require('../../models');

function validateClassAmounts(targetType, classAmounts) {
  if (targetType === 'CLASS') {
    if (!Array.isArray(classAmounts) || classAmounts.length === 0) {
      return 'classAmounts is required and must be a non-empty array when targetType is CLASS';
    }
  }
  if (classAmounts !== undefined && !Array.isArray(classAmounts)) {
    return 'classAmounts must be an array';
  }
  if (Array.isArray(classAmounts)) {
    for (const ca of classAmounts) {
      if (!ca || !ca.classId) return 'Each classAmounts entry requires a classId';
      if (ca.amountPesewas !== undefined && ca.amountPesewas !== null && Number(ca.amountPesewas) < 0) {
        return 'classAmounts amountPesewas must be a non-negative number';
      }
    }
  }
  return null;
}

function validateStudents(targetType, students) {
  if (targetType === 'STUDENT') {
    if (!Array.isArray(students) || students.length === 0) {
      return 'students is required and must be a non-empty array when targetType is STUDENT';
    }
  }
  if (students !== undefined && !Array.isArray(students)) {
    return 'students must be an array';
  }
  if (Array.isArray(students)) {
    for (const s of students) {
      if (!s || !s.studentId) return 'Each students entry requires a studentId';
      if (s.amountPesewas !== undefined && s.amountPesewas !== null && Number(s.amountPesewas) < 0) {
        return 'students amountPesewas must be a non-negative number';
      }
    }
  }
  return null;
}

function validateLevy(req, res, next) {
  const {
    academicYearId, name, targetType, amountPesewas, startDate, dueDate, frequency, classAmounts, students,
  } = req.body || {};

  if (!academicYearId) return next(new ApiError(400, 'academicYearId is required'));
  if (!name || !name.trim()) return next(new ApiError(400, 'name is required'));
  if (!Levy.TARGET_TYPES.includes(targetType)) {
    return next(new ApiError(400, `targetType must be one of: ${Levy.TARGET_TYPES.join(', ')}`));
  }
  if (amountPesewas === undefined || amountPesewas === null || Number.isNaN(Number(amountPesewas))) {
    return next(new ApiError(400, 'amountPesewas is required and must be a number'));
  }
  if (Number(amountPesewas) <= 0) return next(new ApiError(400, 'amountPesewas must be greater than 0'));
  if (startDate && dueDate && dueDate < startDate) {
    return next(new ApiError(400, 'dueDate cannot be before startDate'));
  }

  const resolvedFrequency = frequency || 'ONE_TIME';
  if (!Levy.FREQUENCIES.includes(resolvedFrequency)) {
    return next(new ApiError(400, `frequency must be one of: ${Levy.FREQUENCIES.join(', ')}`));
  }
  if (resolvedFrequency !== 'ONE_TIME' && !startDate) {
    return next(new ApiError(400, 'startDate is required for a recurring levy — it anchors when periods start counting'));
  }

  const classAmountsError = validateClassAmounts(targetType, classAmounts);
  if (classAmountsError) return next(new ApiError(400, classAmountsError));

  const studentsError = validateStudents(targetType, students);
  if (studentsError) return next(new ApiError(400, studentsError));

  return next();
}

function validatePaymentFields(body) {
  const {
    amountPesewas, method, paidDate, cashAccountId,
  } = body || {};
  if (amountPesewas === undefined || amountPesewas === null || Number.isNaN(Number(amountPesewas))) {
    return 'amountPesewas is required and must be a number';
  }
  if (Number(amountPesewas) <= 0) return 'amountPesewas must be greater than 0';
  if (!method) return 'method is required';
  if (!LevyPayment.METHODS.includes(method)) {
    return `method must be one of: ${LevyPayment.METHODS.join(', ')}`;
  }
  if (!paidDate) return 'paidDate is required';
  if (!cashAccountId) return 'cashAccountId is required — which cash/bank/mobile-money account received this payment';
  return null;
}

function validateLevyPayment(req, res, next) {
  const error = validatePaymentFields(req.body);
  if (error) return next(new ApiError(400, error));
  return next();
}

// "Fixed it" or "typo" isn't an audit trail — require an actual explanation,
// same threshold as financials/validators.js's validatePaymentUpdate.
const MIN_REASON_WORDS = 4;

function validateLevyPaymentUpdate(req, res, next) {
  const error = validatePaymentFields(req.body);
  if (error) return next(new ApiError(400, error));

  const reason = String(req.body?.reason || '').trim();
  if (!reason) return next(new ApiError(400, 'reason is required'));

  const wordCount = reason.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_REASON_WORDS) {
    return next(new ApiError(400, 'reason must be more than 3 words — please explain why this payment is being corrected'));
  }
  return next();
}

function validateBulkLevyPayment(req, res, next) {
  const {
    paidDate, method, cashAccountId, records,
  } = req.body || {};

  if (!paidDate) return next(new ApiError(400, 'paidDate is required'));
  if (!method) return next(new ApiError(400, 'method is required'));
  if (!LevyPayment.METHODS.includes(method)) {
    return next(new ApiError(400, `method must be one of: ${LevyPayment.METHODS.join(', ')}`));
  }
  if (!cashAccountId) {
    return next(new ApiError(400, 'cashAccountId is required — which cash/bank/mobile-money account received this payment'));
  }
  if (!Array.isArray(records) || records.length === 0) {
    return next(new ApiError(400, 'records is required and must be a non-empty array'));
  }

  const seenStudentIds = new Set();
  for (const r of records) {
    if (!r || !r.studentId) return next(new ApiError(400, 'Each records entry requires a studentId'));
    if (seenStudentIds.has(r.studentId)) {
      return next(new ApiError(400, `Student ${r.studentId} appears more than once in this batch`));
    }
    seenStudentIds.add(r.studentId);
    if (r.amountPesewas !== undefined && r.amountPesewas !== null) {
      if (Number.isNaN(Number(r.amountPesewas)) || Number(r.amountPesewas) <= 0) {
        return next(new ApiError(400, 'records amountPesewas must be greater than 0 when provided'));
      }
    }
  }

  return next();
}

module.exports = {
  validateLevy, validateLevyPayment, validateLevyPaymentUpdate, validateBulkLevyPayment,
};
