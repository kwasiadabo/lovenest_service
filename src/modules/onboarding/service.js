const bcrypt = require('bcrypt');
const { sequelize, School, User, Role, Level, FeeType, Account, TrainingEnrollment } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { signAccessToken, signRefreshToken } = require('../../utils/jwt');
const { seedDefaultLevels } = require('../../utils/defaultLevels');
const { seedDefaultFeeTypes } = require('../../utils/defaultFeeTypes');
const { seedDefaultChartOfAccounts } = require('../../utils/defaultChartOfAccounts');
const { assertUniqueSchoolName } = require('../../utils/schoolNameGuard');
const { normalizeSchoolCode } = require('../../utils/schoolCodeGuard');
const { encryptSecret } = require('../../utils/secretCrypto');
const { TRAINING_COSTS_PESEWAS } = require('../../config/training');

const SALT_ROUNDS = 12;

// Public self-serve onboarding: a prospective school signs itself up, no
// SuperAdmin involved. Mirrors platform.provisionSchool, including trusting
// the submitter to pick their own 2-3 char school code (validated for
// format upstream, checked for uniqueness here) — but additionally returns
// login tokens so the new admin lands straight in the app instead of having
// to sign in separately afterward.
async function registerSchool({
  name, code, address, phone, email, logoUrl, adminEmail, adminPassword,
  smsSenderId, emailUser, emailAppPassword, studentPopulation,
  trainingMode, trainingAttendeeCount,
}) {
  const existingAdmin = await User.findOne({ where: { email: adminEmail } });
  if (existingAdmin) {
    throw new ApiError(409, 'That email is already registered');
  }

  const normalizedCode = normalizeSchoolCode(code);
  const existingCode = await School.findOne({ where: { code: normalizedCode } });
  if (existingCode) {
    throw new ApiError(409, `School code "${normalizedCode}" is already in use`);
  }

  await assertUniqueSchoolName(School, name);

  const schoolAdminRole = await Role.findOne({ where: { name: 'SCHOOL_ADMIN' } });
  if (!schoolAdminRole) {
    throw new ApiError(500, 'SCHOOL_ADMIN role is not seeded');
  }

  return sequelize.transaction(async (t) => {
    const school = await School.create(
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

    const roles = ['SCHOOL_ADMIN'];
    const tokenPayload = { userId: adminUser.id, schoolId: school.id, roles };

    return {
      accessToken: signAccessToken(tokenPayload),
      refreshToken: signRefreshToken(tokenPayload),
      user: {
        id: adminUser.id,
        email: adminUser.email,
        schoolId: school.id,
        roles,
        schoolStatus: school.status,
        schoolName: school.name,
        schoolLogoUrl: school.logoUrl,
        schoolPlanCode: school.planCode,
        subscriptionExpiresAt: school.subscriptionExpiresAt,
        // Just created above in this same transaction — always 'pending'.
        trainingPaymentStatus: 'pending',
      },
    };
  });
}

module.exports = { registerSchool };
