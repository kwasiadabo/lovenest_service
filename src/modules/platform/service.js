const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const {
  sequelize, School, User, Role, Level, FeeType, Account, PayeTaxBand, SsnitRate,
  Payment, Student, Staff, SchoolStatusEvent, TrainingEnrollment,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { seedDefaultLevels } = require('../../utils/defaultLevels');
const { seedDefaultFeeTypes } = require('../../utils/defaultFeeTypes');
const { seedDefaultChartOfAccounts } = require('../../utils/defaultChartOfAccounts');
const { assertUniqueSchoolName } = require('../../utils/schoolNameGuard');
const { normalizeSchoolCode } = require('../../utils/schoolCodeGuard');
const { encryptSecret } = require('../../utils/secretCrypto');
const { SCHOOL_SAFE_ATTRIBUTES } = require('../../utils/schoolSafeQuery');
const { runSubscriptionReminderSweep } = require('../billing/reminderService');
const { runMonthlyBillingSweep } = require('../financials/monthlyBillingScheduler');
const { TRAINING_COSTS_PESEWAS } = require('../../config/training');

const SALT_ROUNDS = 12;

// SuperAdmin-only: create a new tenant school plus its first School Admin
// user, per plan §6(a) "New school onboarding". Runs in one transaction so a
// school never exists without an admin able to log in.
async function provisionSchool({
  name, code, address, phone, email, logoUrl, adminEmail, adminPassword,
  smsSenderId, emailUser, emailAppPassword, studentPopulation,
  trainingMode, trainingAttendeeCount,
}) {
  const normalizedCode = normalizeSchoolCode(code);
  const existing = await School.findOne({ where: { code: normalizedCode } });
  if (existing) {
    throw new ApiError(409, `School code "${normalizedCode}" is already in use`);
  }

  await assertUniqueSchoolName(School, name);

  const schoolAdminRole = await Role.findOne({ where: { name: 'SCHOOL_ADMIN' } });
  if (!schoolAdminRole) {
    throw new ApiError(500, 'SCHOOL_ADMIN role is not seeded');
  }

  return sequelize.transaction(async (t) => {
    const school = await School.create(
      // 'pending' until the school admin chooses a plan and (for paid plans) pays.
      {
        name, code: normalizedCode, address, phone, email, logoUrl, status: 'pending',
        studentPopulation,
        smsSenderId: smsSenderId || null,
        emailUser: emailUser || null,
        emailAppPasswordEncrypted: encryptSecret(emailAppPassword),
      },
      { transaction: t },
    );

    await seedDefaultLevels(Level, school.id, t);
    await seedDefaultFeeTypes(FeeType, school.id, t);
    await seedDefaultChartOfAccounts(Account, school.id, t);

    // Mandatory 3-day onboarding training — one per school, paid once via
    // the same Paystack pipeline as subscriptions (see
    // billing/service.js#initializeTrainingPayment).
    await TrainingEnrollment.create(
      {
        schoolId: school.id,
        mode: trainingMode,
        attendeeCount: trainingAttendeeCount,
        costPesewas: TRAINING_COSTS_PESEWAS[trainingMode],
      },
      { transaction: t },
    );

    const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    const adminUser = await User.create(
      { schoolId: school.id, email: adminEmail, passwordHash, status: 'active' },
      { transaction: t },
    );

    await adminUser.addRole(schoolAdminRole, { transaction: t });

    const schoolJson = school.toJSON();
    delete schoolJson.emailAppPasswordEncrypted;

    return { school: schoolJson, adminUser: { id: adminUser.id, email: adminUser.email } };
  });
}

async function listSchools() {
  return School.findAll({ ...SCHOOL_SAFE_ATTRIBUTES, order: [['createdAt', 'DESC']] });
}

// SuperAdmin-only tenant edit — deliberately excludes `code` (baked into
// every student's studentNumber, see models/school.js) and status/planCode/
// subscriptionExpiresAt (owned by the tenant actions and billing flows
// respectively). emailAppPassword is only re-encrypted when a new value is
// actually supplied — omitting it leaves the school's existing credential
// untouched rather than wiping it.
async function updateSchool(schoolId, {
  name, address, phone, email, logoUrl, studentPopulation,
  smsSenderId, emailUser, emailAppPassword,
}) {
  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }

  if (name !== undefined && name !== school.name) {
    await assertUniqueSchoolName(School, name, { excludeId: schoolId });
    school.name = name;
  }
  if (address !== undefined) school.address = address || null;
  if (phone !== undefined) school.phone = phone || null;
  if (email !== undefined) school.email = email || null;
  if (logoUrl !== undefined) school.logoUrl = logoUrl;
  if (studentPopulation !== undefined) school.studentPopulation = studentPopulation;
  if (smsSenderId !== undefined) school.smsSenderId = smsSenderId || null;
  if (emailUser !== undefined) school.emailUser = emailUser || null;
  if (emailAppPassword) school.emailAppPasswordEncrypted = encryptSecret(emailAppPassword);

  await school.save();
  return school;
}

async function setSchoolStatus(schoolId, status) {
  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }
  school.status = status;
  await school.save();
  return school;
}

// ---- Tenant actions: block / suspend / deactivate / reactivate ----
// All 4 collapse to the same 2 underlying School.status values
// (active/suspended) — statusReason is what makes them distinct, audit-
// logged operations instead of one generic status flag. Kept separate from
// setSchoolStatus above, which still handles non-punitive transitions
// (pending -> trial -> active) untouched by this map.
const TENANT_ACTIONS = {
  block: { status: 'suspended', statusReason: 'manual_block' },
  suspend: { status: 'suspended', statusReason: 'manual_suspend' },
  deactivate: { status: 'suspended', statusReason: 'manual_deactivate' },
  reactivate: { status: 'active', statusReason: null },
};

async function applyTenantAction(schoolId, action, actorUserId, note) {
  const mapping = TENANT_ACTIONS[action];
  if (!mapping) {
    throw new ApiError(400, `Unknown tenant action "${action}"`);
  }

  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }

  // The correct unblock path for a non-payment auto-suspension (trial
  // expiry OR termly grace-period expiry — see billing/reminderService.js)
  // is the tenant paying again (billing/service.js#applySuccessfulPayment
  // already flips status back to 'active' on success) — a manual
  // reactivate here would just get re-suspended by the very next cron
  // sweep since subscriptionExpiresAt is still in the past.
  if (
    action === 'reactivate'
    && ['non_payment_auto', 'term_non_payment_auto'].includes(school.statusReason)
    && school.subscriptionExpiresAt
    && new Date(school.subscriptionExpiresAt).getTime() <= Date.now()
  ) {
    throw new ApiError(409, 'This school was suspended for non-payment — it must renew its subscription to reactivate, not be manually reactivated');
  }

  const previousStatus = school.status;
  school.status = mapping.status;
  school.statusReason = mapping.statusReason;
  school.statusChangedAt = new Date();
  school.statusChangedByUserId = actorUserId || null;
  await school.save();

  await SchoolStatusEvent.create({
    schoolId,
    actorUserId: actorUserId || null,
    action: `manual_${action}`,
    previousStatus,
    newStatus: school.status,
    note: note || null,
  });

  return school;
}

async function getTenantDetail(schoolId) {
  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }

  const [studentCount, staffCount, payments, events] = await Promise.all([
    Student.count({ where: { schoolId, status: 'ACTIVE' } }),
    Staff.count({ where: { schoolId } }),
    Payment.findAll({ where: { schoolId }, order: [['createdAt', 'DESC']] }),
    SchoolStatusEvent.findAll({ where: { schoolId }, order: [['createdAt', 'DESC']], limit: 50 }),
  ]);

  const daysToExpiry = school.subscriptionExpiresAt
    ? Math.ceil((new Date(school.subscriptionExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;

  return {
    school, studentCount, staffCount, payments, events, daysToExpiry,
  };
}

// Manual population correction (e.g. onboarding figure was wrong) — does
// NOT retroactively change any already-charged plan; only affects the next
// resolveCurrentTier call if the school hasn't made a successful payment yet
// (billing/service.js uses the live student count instead, once it has).
async function updateStudentPopulation(schoolId, studentPopulation) {
  const school = await School.findByPk(schoolId, SCHOOL_SAFE_ATTRIBUTES);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }
  school.studentPopulation = studentPopulation;
  await school.save();
  return school;
}

// ---- Analytics ----

async function getRevenueAnalytics() {
  const totalRevenuePesewas = await Payment.sum('amountPesewas', { where: { status: 'success' } }) || 0;

  const byTierRows = await Payment.findAll({
    where: { status: 'success' },
    attributes: ['planCode', [sequelize.fn('SUM', sequelize.col('amountPesewas')), 'totalPesewas'], [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: ['planCode'],
    raw: true,
  });

  const recentPayments = await Payment.findAll({
    where: { status: 'success' },
    include: [{ model: School, attributes: ['id', 'name', 'code'] }],
    order: [['paidAt', 'DESC']],
    limit: 50,
  });

  return { totalRevenuePesewas, byTier: byTierRows, recentPayments };
}

async function getTenantHealthAnalytics() {
  const statusCounts = await School.findAll({
    attributes: ['status', 'statusReason', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: ['status', 'statusReason'],
    raw: true,
  });

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const expiringSoon = await School.findAll({
    ...SCHOOL_SAFE_ATTRIBUTES,
    where: {
      status: { [Op.in]: ['trial', 'active'] },
      subscriptionExpiresAt: { [Op.between]: [now, in14Days] },
    },
    order: [['subscriptionExpiresAt', 'ASC']],
  });

  return { statusCounts, expiringSoon };
}

async function getUsageAnalytics() {
  const [totalStudents, totalStaff] = await Promise.all([
    Student.count({ where: { status: 'ACTIVE' } }),
    Staff.count(),
  ]);

  const perSchoolUsage = await School.findAll({
    attributes: ['id', 'name', 'code', 'planCode', 'smsAllowance', 'smsUsedThisCycle'],
    order: [['smsUsedThisCycle', 'DESC']],
  });

  const schoolsByMonth = await School.findAll({
    attributes: [[sequelize.fn('FORMAT', sequelize.col('createdAt'), 'yyyy-MM'), 'month'], [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: [sequelize.fn('FORMAT', sequelize.col('createdAt'), 'yyyy-MM')],
    raw: true,
  });

  const revenueByMonth = await Payment.findAll({
    where: { status: 'success' },
    attributes: [[sequelize.fn('FORMAT', sequelize.col('paidAt'), 'yyyy-MM'), 'month'], [sequelize.fn('SUM', sequelize.col('amountPesewas')), 'totalPesewas']],
    group: [sequelize.fn('FORMAT', sequelize.col('paidAt'), 'yyyy-MM')],
    raw: true,
  });

  return {
    totalStudents, totalStaff, perSchoolUsage, growth: { schoolsByMonth, revenueByMonth },
  };
}

async function runReminderSweepNow() {
  return runSubscriptionReminderSweep();
}

async function runMonthlyBillingSweepNow() {
  return runMonthlyBillingSweep(new Date(), { force: true });
}

// ---- Statutory settings: SSNIT rate + PAYE tax bands ----
// Platform-level, national data shared by every school's payroll (see
// models/ssnitrate.js, models/payetaxband.js) — SUPER_ADMIN only.
// "Editing" always means inserting a new row with a fresh effectiveFrom
// date rather than mutating an existing one, so a rate change here never
// retroactively changes a payslip that was already computed under the old
// rate (see utils/ghanaPaye.js).

async function getStatutorySettings() {
  const ssnitRates = await SsnitRate.findAll({ order: [['effectiveFrom', 'DESC']] });
  const latestSsnitEffectiveFrom = ssnitRates[0]?.effectiveFrom || null;

  const bands = await PayeTaxBand.findAll({ order: [['effectiveFrom', 'DESC'], ['bandOrder', 'ASC']] });
  const latestBandEffectiveFrom = bands[0]?.effectiveFrom || null;
  const bandsByDate = new Map();
  bands.forEach((b) => {
    if (!bandsByDate.has(b.effectiveFrom)) bandsByDate.set(b.effectiveFrom, []);
    bandsByDate.get(b.effectiveFrom).push(b);
  });

  return {
    ssnitRates: ssnitRates.map((r) => ({
      id: r.id,
      effectiveFrom: r.effectiveFrom,
      employeeRatePercent: Number(r.employeeRatePercent),
      employerRatePercent: Number(r.employerRatePercent),
      isActive: r.effectiveFrom === latestSsnitEffectiveFrom,
    })),
    payeTaxBandSets: Array.from(bandsByDate.entries()).map(([effectiveFrom, rows]) => ({
      effectiveFrom,
      isActive: effectiveFrom === latestBandEffectiveFrom,
      bands: rows
        .sort((a, b) => a.bandOrder - b.bandOrder)
        .map((b) => ({ id: b.id, bandOrder: b.bandOrder, upToPesewas: b.upToPesewas, ratePercent: Number(b.ratePercent) })),
    })),
  };
}

async function setSsnitRate({ employeeRatePercent, employerRatePercent, effectiveFrom }) {
  const existing = await SsnitRate.findOne({ where: { effectiveFrom } });
  if (existing) throw new ApiError(409, `An SSNIT rate effective ${effectiveFrom} already exists`);
  return SsnitRate.create({ employeeRatePercent, employerRatePercent, effectiveFrom });
}

async function setPayeTaxBands({ effectiveFrom, bands }) {
  return sequelize.transaction(async (t) => {
    const existing = await PayeTaxBand.count({ where: { effectiveFrom }, transaction: t });
    if (existing > 0) throw new ApiError(409, `A PAYE tax band set effective ${effectiveFrom} already exists`);
    return PayeTaxBand.bulkCreate(
      bands.map((b, i) => ({
        effectiveFrom,
        bandOrder: i + 1,
        upToPesewas: b.upToPesewas === undefined ? null : b.upToPesewas,
        ratePercent: b.ratePercent,
      })),
      { transaction: t },
    );
  });
}

module.exports = {
  provisionSchool,
  listSchools,
  updateSchool,
  setSchoolStatus,
  applyTenantAction,
  getTenantDetail,
  updateStudentPopulation,
  getRevenueAnalytics,
  getTenantHealthAnalytics,
  getUsageAnalytics,
  runReminderSweepNow,
  runMonthlyBillingSweepNow,
  getStatutorySettings,
  setSsnitRate,
  setPayeTaxBands,
};
