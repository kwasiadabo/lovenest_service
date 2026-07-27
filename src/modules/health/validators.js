const ApiError = require('../../utils/ApiError');
const { SickBayVisit, Immunization } = require('../../models');

function validateSickBayVisit(req, res, next) {
  const { studentId, reason, outcome } = req.body || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!reason || !reason.trim()) return next(new ApiError(400, 'reason is required'));
  if (outcome !== undefined && !SickBayVisit.OUTCOMES.includes(outcome)) {
    return next(new ApiError(400, `outcome must be one of: ${SickBayVisit.OUTCOMES.join(', ')}`));
  }
  return next();
}

function validateMedicationLog(req, res, next) {
  const { studentId, medicationName, dosage } = req.body || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!medicationName || !medicationName.trim()) return next(new ApiError(400, 'medicationName is required'));
  if (!dosage || !dosage.trim()) return next(new ApiError(400, 'dosage is required'));
  return next();
}

function validateImmunization(req, res, next) {
  const {
    studentId, vaccine, otherVaccineName, administeredDate,
  } = req.body || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!vaccine || !Immunization.VACCINES.includes(vaccine)) {
    return next(new ApiError(400, `vaccine must be one of: ${Immunization.VACCINES.join(', ')}`));
  }
  if (vaccine === 'OTHER' && !otherVaccineName?.trim()) {
    return next(new ApiError(400, 'otherVaccineName is required when vaccine is OTHER'));
  }
  if (!administeredDate) return next(new ApiError(400, 'administeredDate is required'));
  return next();
}

module.exports = { validateSickBayVisit, validateMedicationLog, validateImmunization };
