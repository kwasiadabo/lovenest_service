const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const {
  sequelize, School, User, Role, Level, FeeType, Account, TrainingEnrollment,
  AcademicYear, Term,
} = require('../../models');
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

// Rough term windows within an academic year starting in `startYear` — good
// enough to satisfy AcademicYear/Term's NOT NULL date columns at signup;
// the admin can adjust exact dates from /admin/academic-years afterward.
function deriveAcademicYearDates(startYear) {
  return { startDate: `${startYear}-09-01`, endDate: `${startYear + 1}-08-31` };
}

function deriveTermDates(startYear, sequence) {
  if (sequence === 1) return { startDate: `${startYear}-09-01`, endDate: `${startYear}-12-15` };
  if (sequence === 2) return { startDate: `${startYear + 1}-01-05`, endDate: `${startYear + 1}-03-28` };
  return { startDate: `${startYear + 1}-04-20`, endDate: `${startYear + 1}-08-01` };
}

// Fail fast on anything that would make registration impossible — called
// both before a self-serve signup creates the school directly, and before
// the paid flow (paymentService.js) charges anyone, so nobody pays for a
// registration that can't complete.
async function checkRegistrationAvailable({ adminEmail, code, name }) {
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
}

// The actual creation transaction, shared by both the direct (unpaid)
// self-serve endpoint and the paid flow's completeRegistration step (see
// paymentService.js) — takes an already-hashed password so the paid path
// never has to persist (or re-receive) a plaintext password.
async function createSchoolRecord({
  name, code, address, phone, email, logoUrl, adminEmail, passwordHash,
  smsSenderId, emailUser, emailAppPassword, studentPopulation,
  trainingMode, trainingAttendeeCount, academicYearName, termSequence,
  forcePasswordChange = false,
}) {
  const normalizedCode = normalizeSchoolCode(code);
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
    // billing/service.js#initializeTrainingPayment, and for the paid
    // self-serve flow, paymentService.js — both fees are collected
    // together there, before the school even exists).
    await TrainingEnrollment.create(
      {
        schoolId: school.id,
        mode: trainingMode,
        attendeeCount: trainingAttendeeCount,
        costPesewas: TRAINING_COSTS_PESEWAS[trainingMode],
      },
      { transaction: t },
    );

    // The academic year/term the registrant is starting from — captured at
    // signup so the school isn't left with zero academic structure before
    // its admin has even logged in once.
    if (academicYearName && termSequence) {
      const startYear = Number.parseInt(academicYearName.slice(0, 4), 10);
      const yearDates = deriveAcademicYearDates(startYear);
      const academicYear = await AcademicYear.create(
        { schoolId: school.id, name: academicYearName, isCurrent: true, ...yearDates },
        { transaction: t },
      );
      const termDates = deriveTermDates(startYear, termSequence);
      await Term.create(
        {
          schoolId: school.id,
          academicYearId: academicYear.id,
          name: `Term ${termSequence}`,
          sequence: termSequence,
          isCurrent: true,
          ...termDates,
        },
        { transaction: t },
      );
    }

    const adminUser = await User.create(
      { schoolId: school.id, email: adminEmail, passwordHash, status: 'active', forcePasswordChange },
      { transaction: t },
    );

    await adminUser.addRole(schoolAdminRole, { transaction: t });

    return { school, adminUser };
  });
}

// Public self-serve onboarding: a prospective school signs itself up, no
// SuperAdmin involved. Mirrors platform.provisionSchool, including trusting
// the submitter to pick their own 2-3 char school code (validated for
// format upstream, checked for uniqueness here) — but additionally returns
// login tokens so the new admin lands straight in the app instead of having
// to sign in separately afterward.
//
// This is the direct, unpaid path (POST /onboarding/schools) — the
// marketing site's UI now goes through paymentService.js's paid flow
// instead, but this endpoint is left in place rather than removed.
async function registerSchool(fields) {
  await checkRegistrationAvailable(fields);
  const passwordHash = await bcrypt.hash(fields.adminPassword, SALT_ROUNDS);
  const { school, adminUser } = await createSchoolRecord({ ...fields, passwordHash });

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
}

// Public directory for the marketing site — deliberately narrow columns
// (no email/phone/billing fields) since this is reachable with no auth at
// all. Suspended schools are hidden; pending/trial/active are all shown so a
// school appears here as soon as it's actually created (registration is
// already gated behind payment for the self-serve flow).
async function listPublicSchools() {
  return School.findAll({
    where: { status: { [Op.ne]: 'suspended' } },
    attributes: ['id', 'name', 'address', 'logoUrl'],
    order: [['name', 'ASC']],
  });
}

// Backs the branded login page (/s/:schoolCode/login) — same public-safe,
// no-auth-required rationale as listPublicSchools above, just looked up by
// the school's own code instead of listed in bulk. code is included in the
// response so the frontend can echo it back into links without re-deriving
// it. Suspended schools 404 here for the same reason they're hidden from
// listPublicSchools — a blocked tenant shouldn't have a publicly servable
// branded login page.
async function getPublicSchoolByCode(code) {
  return School.findOne({
    where: { code, status: { [Op.ne]: 'suspended' } },
    attributes: ['id', 'code', 'name', 'logoUrl'],
  });
}

module.exports = {
  registerSchool, checkRegistrationAvailable, createSchoolRecord, SALT_ROUNDS, listPublicSchools,
  getPublicSchoolByCode,
};
