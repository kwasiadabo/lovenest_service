const ApiError = require('./ApiError');

// Wraps a tenant-scoped Sequelize model so every read/write is forced through
// a schoolId filter. Services must call this instead of using the model
// directly — see plan §1: "a thin Sequelize wrapper/helper enforces that
// tenant-scoped models are never queried without a schoolId filter".
function tenantScoped(model, schoolId) {
  if (!schoolId) {
    throw new ApiError(500, `tenantScoped(${model.name}) called without a schoolId`);
  }

  const withTenant = (where = {}) => ({ ...where, schoolId });

  return {
    findAll: (options = {}) =>
      model.findAll({ ...options, where: withTenant(options.where) }),

    findOne: (options = {}) =>
      model.findOne({ ...options, where: withTenant(options.where) }),

    findByPk: (id, options = {}) =>
      model.findOne({ ...options, where: withTenant({ ...(options.where || {}), id }) }),

    count: (options = {}) =>
      model.count({ ...options, where: withTenant(options.where) }),

    create: (values, options = {}) =>
      model.create({ ...values, schoolId }, options),

    bulkCreate: (records, options = {}) =>
      model.bulkCreate(records.map((r) => ({ ...r, schoolId })), options),

    update: (values, options = {}) =>
      model.update(values, { ...options, where: withTenant(options.where) }),

    destroy: (options = {}) =>
      model.destroy({ ...options, where: withTenant(options.where) }),
  };
}

module.exports = tenantScoped;
