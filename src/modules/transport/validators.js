const ApiError = require('../../utils/ApiError');
const {
  Vehicle, PickupRecord, StudentTransport, TransportPayment, VehicleTrip,
} = require('../../models');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateOptionalFeePesewas(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (Number.isNaN(Number(value)) || Number(value) < 0) return `${label} must be a non-negative number`;
  return null;
}

function validateVehicle(req, res, next) {
  const {
    name, registrationNumber, capacity, status, termlyFeePesewas, monthlyFeePesewas,
  } = req.body || {};
  if (!name || !name.trim()) return next(new ApiError(400, 'name is required'));
  if (!registrationNumber || !registrationNumber.trim()) return next(new ApiError(400, 'registrationNumber is required'));
  if (capacity === undefined || Number.isNaN(Number(capacity)) || Number(capacity) <= 0) {
    return next(new ApiError(400, 'capacity is required and must be greater than 0'));
  }
  if (status && !Vehicle.STATUSES.includes(status)) {
    return next(new ApiError(400, `status must be one of: ${Vehicle.STATUSES.join(', ')}`));
  }
  const termlyError = validateOptionalFeePesewas(termlyFeePesewas, 'termlyFeePesewas');
  if (termlyError) return next(new ApiError(400, termlyError));
  const monthlyError = validateOptionalFeePesewas(monthlyFeePesewas, 'monthlyFeePesewas');
  if (monthlyError) return next(new ApiError(400, monthlyError));
  return next();
}

function validateRoute(req, res, next) {
  const { vehicleId, name } = req.body || {};
  if (!vehicleId) return next(new ApiError(400, 'vehicleId is required'));
  if (!name || !name.trim()) return next(new ApiError(400, 'name is required'));
  return next();
}

function validatePickupPoint(req, res, next) {
  const { routeId, name, scheduledTime } = req.body || {};
  if (!routeId) return next(new ApiError(400, 'routeId is required'));
  if (!name || !name.trim()) return next(new ApiError(400, 'name is required'));
  if (!TIME_RE.test(scheduledTime || '')) return next(new ApiError(400, 'scheduledTime must be in HH:MM (24h) format'));
  return next();
}

function validateStudentTransportAssign(req, res, next) {
  const {
    studentId, vehicleId, startDate, billingCycle,
  } = req.body || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!vehicleId) return next(new ApiError(400, 'vehicleId is required'));
  if (!startDate) return next(new ApiError(400, 'startDate is required'));
  if (billingCycle && !StudentTransport.BILLING_CYCLES.includes(billingCycle)) {
    return next(new ApiError(400, `billingCycle must be one of: ${StudentTransport.BILLING_CYCLES.join(', ')}`));
  }
  return next();
}

function validateTransportInvoicePeriod({ billingCycle, termId, month, year }) {
  if (!StudentTransport.BILLING_CYCLES.includes(billingCycle)) {
    return `billingCycle must be one of: ${StudentTransport.BILLING_CYCLES.join(', ')}`;
  }
  if (billingCycle === 'TERMLY' && !termId) return 'termId is required for termly billing';
  if (billingCycle === 'MONTHLY' && (!month || !year)) return 'month and year are required for monthly billing';
  return null;
}

function validateGenerateTransportInvoices(req, res, next) {
  const error = validateTransportInvoicePeriod(req.body || {});
  if (error) return next(new ApiError(400, error));
  return next();
}

function validatePreviewTransportInvoices(req, res, next) {
  const error = validateTransportInvoicePeriod(req.query || {});
  if (error) return next(new ApiError(400, error));
  return next();
}

// Shared by create and edit — an edit is validated exactly like a fresh
// payment, plus (in validateTransportPaymentUpdate below) a mandatory reason.
function validateTransportPaymentFields(body) {
  const {
    amountPesewas, method, paidDate, cashAccountId,
  } = body || {};
  if (amountPesewas === undefined || amountPesewas === null || Number.isNaN(Number(amountPesewas))) {
    return 'amountPesewas is required and must be a number';
  }
  if (Number(amountPesewas) <= 0) return 'amountPesewas must be greater than 0';
  if (!method) return 'method is required';
  if (!TransportPayment.METHODS.includes(method)) {
    return `method must be one of: ${TransportPayment.METHODS.join(', ')}`;
  }
  if (!paidDate) return 'paidDate is required';
  if (!cashAccountId) return 'cashAccountId is required — which cash/bank/mobile-money account received this payment';
  return null;
}

function validateTransportPayment(req, res, next) {
  const error = validateTransportPaymentFields(req.body);
  if (error) return next(new ApiError(400, error));
  return next();
}

// "Fixed it" or "typo" isn't an audit trail — require an actual explanation,
// same bar as financials/validators.js#validatePaymentUpdate.
const MIN_REASON_WORDS = 4;

function validateTransportPaymentUpdate(req, res, next) {
  const error = validateTransportPaymentFields(req.body);
  if (error) return next(new ApiError(400, error));

  const reason = String(req.body?.reason || '').trim();
  if (!reason) return next(new ApiError(400, 'reason is required'));

  const wordCount = reason.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_REASON_WORDS) {
    return next(new ApiError(400, 'reason must be more than 3 words — please explain why this payment is being corrected'));
  }
  return next();
}

function validatePickupRecordQuery(req, res, next) {
  const { vehicleId, date } = req.query || {};
  if (!vehicleId) return next(new ApiError(400, 'vehicleId is required'));
  if (!date) return next(new ApiError(400, 'date is required'));
  return next();
}

function validateDropoffRecordQuery(req, res, next) {
  const { vehicleId, date } = req.query || {};
  if (!vehicleId) return next(new ApiError(400, 'vehicleId is required'));
  if (!date) return next(new ApiError(400, 'date is required'));
  return next();
}

function validateRecordDropoff(req, res, next) {
  const {
    studentId, vehicleId, latitude, longitude,
  } = req.body || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (!vehicleId) return next(new ApiError(400, 'vehicleId is required'));
  if (latitude !== undefined && latitude !== null && latitude !== '' && Number.isNaN(Number(latitude))) {
    return next(new ApiError(400, 'latitude must be a number'));
  }
  if (longitude !== undefined && longitude !== null && longitude !== '' && Number.isNaN(Number(longitude))) {
    return next(new ApiError(400, 'longitude must be a number'));
  }
  return next();
}

function validateStudentDropoffHistoryQuery(req, res, next) {
  const { studentId } = req.query || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  return next();
}

function validatePickupRecordSave(req, res, next) {
  const { vehicleId, date, records } = req.body || {};
  if (!vehicleId) return next(new ApiError(400, 'vehicleId is required'));
  if (!date) return next(new ApiError(400, 'date is required'));
  if (!Array.isArray(records) || records.length === 0) {
    return next(new ApiError(400, 'records is required and must be a non-empty array'));
  }
  for (const record of records) {
    if (!record.studentId) return next(new ApiError(400, 'Every record must have a studentId'));
    if (!PickupRecord.STATUSES.includes(record.status)) {
      return next(new ApiError(400, `Every record's status must be one of: ${PickupRecord.STATUSES.join(', ')}`));
    }
  }
  return next();
}

function validateStudentPickupHistoryQuery(req, res, next) {
  const { studentId } = req.query || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  return next();
}

function validateStartTrip(req, res, next) {
  const { tripType } = req.body || {};
  if (tripType && !VehicleTrip.TRIP_TYPES.includes(tripType)) {
    return next(new ApiError(400, `tripType must be one of: ${VehicleTrip.TRIP_TYPES.join(', ')}`));
  }
  return next();
}

function validateMyPickupRecordSave(req, res, next) {
  const { records } = req.body || {};
  if (!Array.isArray(records) || records.length === 0) {
    return next(new ApiError(400, 'records is required and must be a non-empty array'));
  }
  for (const record of records) {
    if (!record.studentId) return next(new ApiError(400, 'Every record must have a studentId'));
    if (!PickupRecord.STATUSES.includes(record.status)) {
      return next(new ApiError(400, `Every record's status must be one of: ${PickupRecord.STATUSES.join(', ')}`));
    }
  }
  return next();
}

function validateMyDropoffRecord(req, res, next) {
  const { studentId, latitude, longitude } = req.body || {};
  if (!studentId) return next(new ApiError(400, 'studentId is required'));
  if (latitude !== undefined && latitude !== null && latitude !== '' && Number.isNaN(Number(latitude))) {
    return next(new ApiError(400, 'latitude must be a number'));
  }
  if (longitude !== undefined && longitude !== null && longitude !== '' && Number.isNaN(Number(longitude))) {
    return next(new ApiError(400, 'longitude must be a number'));
  }
  return next();
}

function validateTripLocation(req, res, next) {
  const { latitude, longitude } = req.body || {};
  if (latitude === undefined || latitude === null || latitude === '' || Number.isNaN(Number(latitude))) {
    return next(new ApiError(400, 'latitude is required and must be a number'));
  }
  if (longitude === undefined || longitude === null || longitude === '' || Number.isNaN(Number(longitude))) {
    return next(new ApiError(400, 'longitude is required and must be a number'));
  }
  return next();
}

module.exports = {
  validateVehicle,
  validateRoute,
  validatePickupPoint,
  validateStudentTransportAssign,
  validatePickupRecordQuery,
  validatePickupRecordSave,
  validateStudentPickupHistoryQuery,
  validateDropoffRecordQuery,
  validateRecordDropoff,
  validateStudentDropoffHistoryQuery,
  validateGenerateTransportInvoices,
  validatePreviewTransportInvoices,
  validateTransportPayment,
  validateTransportPaymentUpdate,
  validateStartTrip,
  validateTripLocation,
  validateMyPickupRecordSave,
  validateMyDropoffRecord,
};
