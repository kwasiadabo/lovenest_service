'use strict';
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { DEFAULT_LEVELS } = require('../utils/defaultLevels');
const { DEFAULT_FEE_TYPES } = require('../utils/defaultFeeTypes');
const { DEFAULT_ACCOUNTS } = require('../utils/defaultChartOfAccounts');

// This app is a single-tenant deployment for exactly one school — unlike
// the other seeders here, this one creates that school itself (the
// multi-tenant self-serve onboarding flow that used to do this was removed).
const SCHOOL_CODE = 'LIC';
const SALT_ROUNDS = 12;

module.exports = {
  up: async (queryInterface) => {
    const [[existing]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools WHERE code = '${SCHOOL_CODE}'`,
    );
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`Skipping — a school with code ${SCHOOL_CODE} already exists (${existing.id})`);
      return;
    }

    const now = new Date();
    const schoolId = randomUUID();

    await queryInterface.bulkInsert('schools', [{
      id: schoolId,
      name: 'Lovenest International Christian School',
      code: SCHOOL_CODE,
      address: process.env.LOVENEST_SCHOOL_ADDRESS || null,
      phone: process.env.LOVENEST_SCHOOL_PHONE || null,
      email: process.env.LOVENEST_SCHOOL_EMAIL || null,
      logoUrl: null,
      headteacherSignatureUrl: null,
      paymentInstructions: null,
      brandColor: null,
      brandColorSecondary: null,
      idCardTemplate: 'classic',
      // Vestigial multi-tenant-billing fields (see models/school.js) — set
      // to inert defaults, never read as live state by anything anymore.
      status: 'active',
      planCode: null,
      subscriptionExpiresAt: null,
      studentPopulation: Number(process.env.LOVENEST_STUDENT_POPULATION) || 0,
      smsAllowance: null,
      smsUsedThisCycle: 0,
      statusReason: null,
      statusChangedAt: null,
      statusChangedByUserId: null,
      reminder14SentAt: null,
      reminder3SentAt: null,
      termGraceEndsAt: null,
      termPaymentPromptSentAt: null,
      smsSenderId: null,
      emailUser: null,
      emailAppPasswordEncrypted: null,
      caWeight: 0.3,
      examWeight: 0.7,
      classworkSourceMode: 'MANUAL',
      classworkWeight: 0.5,
      projectWeight: 0.5,
      passMarkPercent: null,
      bestAggregateSubjectCount: 6,
      thirdChildDiscountPercent: 0,
      fourthChildAndAboveDiscountPercent: 0,
      attendanceReportingTime: '08:00',
      attendanceLatenessCutoffTime: '08:15',
      attendanceAutoAbsentCutoffTime: '10:00',
      gateLogDismissalTime: '15:00',
      createdAt: now,
      updatedAt: now,
    }]);

    await queryInterface.bulkInsert(
      'levels',
      DEFAULT_LEVELS.map((level) => ({
        id: randomUUID(), schoolId, ...level, createdAt: now, updatedAt: now,
      })),
    );

    await queryInterface.bulkInsert(
      'fee_types',
      DEFAULT_FEE_TYPES.map((feeType) => ({
        id: randomUUID(), schoolId, ...feeType, createdAt: now, updatedAt: now,
      })),
    );

    await queryInterface.bulkInsert(
      'accounts',
      DEFAULT_ACCOUNTS.map((account) => ({
        id: randomUUID(),
        schoolId,
        isContra: false,
        isCashAccount: false,
        isSystemAccount: false,
        isActive: true,
        parentAccountId: null,
        description: null,
        ...account,
        createdAt: now,
        updatedAt: now,
      })),
    );

    // First academic year + term — adjust via Settings/Academic once real
    // dates are known; something has to exist for the app's "current
    // period" logic to have anything to point at.
    const academicYearId = randomUUID();
    await queryInterface.bulkInsert('academic_years', [{
      id: academicYearId,
      schoolId,
      name: process.env.LOVENEST_ACADEMIC_YEAR_NAME || '2026/2027',
      startDate: process.env.LOVENEST_ACADEMIC_YEAR_START || '2026-09-01',
      endDate: process.env.LOVENEST_ACADEMIC_YEAR_END || '2027-07-31',
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    }]);

    await queryInterface.bulkInsert('terms', [{
      id: randomUUID(),
      schoolId,
      academicYearId,
      name: 'Term 1',
      sequence: 1,
      startDate: process.env.LOVENEST_TERM_START || '2026-09-01',
      endDate: process.env.LOVENEST_TERM_END || '2026-12-11',
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    }]);

    const [[schoolAdminRole]] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE name = 'SCHOOL_ADMIN'",
    );
    if (!schoolAdminRole) throw new Error('SCHOOL_ADMIN role is not seeded — run the roles seeder first');

    const adminUserId = randomUUID();
    const adminPasswordHash = await bcrypt.hash(
      process.env.LOVENEST_ADMIN_PASSWORD || 'ChangeMe123!',
      SALT_ROUNDS,
    );
    await queryInterface.bulkInsert('users', [{
      id: adminUserId,
      schoolId,
      fullName: process.env.LOVENEST_ADMIN_NAME || 'School Administrator',
      email: process.env.LOVENEST_ADMIN_EMAIL || 'admin@lovenest.edu.gh',
      passwordHash: adminPasswordHash,
      status: 'active',
      // Forces a real password to be set on first login, since the seeded
      // one is a known default/env value.
      forcePasswordChange: true,
      createdAt: now,
      updatedAt: now,
    }]);

    await queryInterface.bulkInsert('user_roles', [{
      id: randomUUID(),
      userId: adminUserId,
      roleId: schoolAdminRole.id,
    }]);
  },

  down: async (queryInterface) => {
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools WHERE code = '${SCHOOL_CODE}'`,
    );
    if (!school) return;

    await queryInterface.sequelize.query(`
      DELETE ur FROM user_roles ur
      INNER JOIN users u ON u.id = ur.userId
      WHERE u.schoolId = '${school.id}'
    `);
    await queryInterface.bulkDelete('users', { schoolId: school.id });
    await queryInterface.bulkDelete('terms', { schoolId: school.id });
    await queryInterface.bulkDelete('academic_years', { schoolId: school.id });
    await queryInterface.bulkDelete('accounts', { schoolId: school.id });
    await queryInterface.bulkDelete('fee_types', { schoolId: school.id });
    await queryInterface.bulkDelete('levels', { schoolId: school.id });
    await queryInterface.bulkDelete('schools', { id: school.id });
  },
};
