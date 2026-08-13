const { Op } = require('sequelize');
const { School } = require('../models');
const ApiError = require('./ApiError');

// Shared by every public, unauthenticated module (admissions, announcements,
// sermons, ...) that needs to resolve a marketing-site visitor's schoolCode
// (e.g. the frontend's content.ts `school.tenantCode`) to a schoolId without
// a Bearer token. Same lookup admissions/service.js#resolveSchoolByCode uses
// privately — kept here too so new public modules don't each reimplement it.
async function resolveSchoolByCode(schoolCode) {
  const school = await School.findOne({
    where: { code: (schoolCode || '').toUpperCase(), status: { [Op.ne]: 'suspended' } },
  });
  if (!school) throw new ApiError(404, 'School not found');
  return school;
}

module.exports = resolveSchoolByCode;
