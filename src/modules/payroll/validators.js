const ApiError = require('../../utils/ApiError');
const { SalaryComponent } = require('../../models');

function validateSalaryStructure(req, res, next) {
  const { basicSalaryPesewas, effectiveDate, components } = req.body || {};
  if (basicSalaryPesewas === undefined || basicSalaryPesewas === null || Number(basicSalaryPesewas) <= 0) {
    return next(new ApiError(400, 'basicSalaryPesewas is required and must be greater than 0'));
  }
  if (!effectiveDate) return next(new ApiError(400, 'effectiveDate is required'));
  if (components !== undefined) {
    if (!Array.isArray(components)) return next(new ApiError(400, 'components must be an array'));
    for (const c of components) {
      if (!c.name) return next(new ApiError(400, 'Each component requires a name'));
      if (!SalaryComponent.COMPONENT_TYPES.includes(c.componentType)) {
        return next(new ApiError(400, `componentType must be one of: ${SalaryComponent.COMPONENT_TYPES.join(', ')}`));
      }
      if (!SalaryComponent.CALC_METHODS.includes(c.calcMethod)) {
        return next(new ApiError(400, `calcMethod must be one of: ${SalaryComponent.CALC_METHODS.join(', ')}`));
      }
      if (c.calcMethod === 'FIXED' && !(Number(c.amountPesewas) > 0)) {
        return next(new ApiError(400, `${c.name}: amountPesewas must be greater than 0 for a FIXED component`));
      }
      if (c.calcMethod === 'PERCENT_OF_BASIC' && !(Number(c.percent) > 0)) {
        return next(new ApiError(400, `${c.name}: percent must be greater than 0 for a PERCENT_OF_BASIC component`));
      }
    }
  }
  return next();
}

function validatePayrollRun(req, res, next) {
  const { payPeriodStart, payPeriodEnd, payPeriodLabel } = req.body || {};
  if (!payPeriodStart) return next(new ApiError(400, 'payPeriodStart is required'));
  if (!payPeriodEnd) return next(new ApiError(400, 'payPeriodEnd is required'));
  if (payPeriodEnd < payPeriodStart) return next(new ApiError(400, 'payPeriodEnd cannot be before payPeriodStart'));
  if (!payPeriodLabel || !payPeriodLabel.trim()) return next(new ApiError(400, 'payPeriodLabel is required'));
  return next();
}

function validatePayPayrollRun(req, res, next) {
  const { cashAccountId } = req.body || {};
  if (!cashAccountId) return next(new ApiError(400, 'cashAccountId is required'));
  return next();
}

function validateStatutoryRemittance(req, res, next) {
  const {
    payrollRunId, type, amountPesewas, remittanceDate, cashAccountId,
  } = req.body || {};
  if (!payrollRunId) return next(new ApiError(400, 'payrollRunId is required'));
  if (!['PAYE', 'SSNIT'].includes(type)) return next(new ApiError(400, 'type must be one of: PAYE, SSNIT'));
  if (!(Number(amountPesewas) > 0)) return next(new ApiError(400, 'amountPesewas must be greater than 0'));
  if (!remittanceDate) return next(new ApiError(400, 'remittanceDate is required'));
  if (!cashAccountId) return next(new ApiError(400, 'cashAccountId is required'));
  return next();
}

module.exports = {
  validateSalaryStructure, validatePayrollRun, validatePayPayrollRun, validateStatutoryRemittance,
};
