'use strict';

const { randomUUID } = require('crypto');

// Demo-only marker (statusNote), used by `down` to find and remove exactly
// the students/parents/assignments this seeder created without touching real data.
const MARKER = 'seed:demo-students-2026';

// Flat admission fee (GHS 500) for every seeded student's AdmissionPayment —
// real amounts are set per level on the Fees setup page; this is just enough
// to mark the fee as paid so the Directory shows them as fully admitted.
const ADMISSION_FEE_PESEWAS = 50000;

const MALE_FIRST_NAMES = [
  'Kwame', 'Kofi', 'Kwabena', 'Kwesi', 'Yaw', 'Kwaku', 'Kwadwo', 'Elvis', 'Emmanuel', 'Michael',
  'Daniel', 'Samuel', 'Isaac', 'Prince', 'Eric', 'Solomon', 'Bernard', 'Richard', 'Francis', 'Nana Yaw',
];
const FEMALE_FIRST_NAMES = [
  'Ama', 'Efua', 'Akosua', 'Abena', 'Adjoa', 'Yaa', 'Afia', 'Grace', 'Comfort', 'Gifty',
  'Priscilla', 'Rita', 'Mavis', 'Linda', 'Vivian', 'Georgina', 'Patience', 'Joyce', 'Belinda', 'Theresa',
];
const LAST_NAMES = [
  'Mensah', 'Owusu', 'Boateng', 'Asante', 'Agyeman', 'Appiah', 'Osei', 'Adjei', 'Amoah', 'Darko',
  'Frimpong', 'Kusi', 'Sarpong', 'Addo', 'Ofori', 'Tetteh', 'Quaye', 'Amankwah', 'Ansah', 'Yeboah',
  'Wiredu', 'Antwi', 'Acheampong', 'Gyasi',
];
const ADDRESSES = [
  'East Legon, Accra', 'Adenta, Accra', 'Tema Community 5', 'Achimota, Accra', 'Madina, Accra',
  'Kasoa, Central Region', 'Spintex, Accra', 'Dansoman, Accra', 'Ashaiman, Accra', 'Lapaz, Accra',
];

// Rough age range per level, used to generate a plausible dateOfBirth.
const LEVEL_AGE_RANGES = {
  'Pre-school': [3, 5],
  'Lower Primary': [6, 10],
  'Upper Primary': [10, 12],
  JHS: [12, 15],
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[randomInt(0, list.length - 1)];
}

function randomDateOnly(year) {
  const month = randomInt(1, 12);
  const day = randomInt(1, 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

module.exports = {
  up: async (queryInterface) => {
    const [[school]] = await queryInterface.sequelize.query(`
      SELECT TOP 1 s.id AS schoolId, s.code AS schoolCode, ay.id AS academicYearId, ay.startDate AS academicYearStart
      FROM schools s
      INNER JOIN academic_years ay ON ay.schoolId = s.id AND ay.isCurrent = 1
    `);
    if (!school) throw new Error('No school with a current academic year found — set one up before seeding students');

    const classes = await queryInterface.sequelize.query(`
      SELECT c.id AS classId, l.name AS levelName
      FROM classes c
      INNER JOIN levels l ON l.id = c.levelId
      WHERE c.schoolId = :schoolId
    `, { replacements: { schoolId: school.schoolId }, type: queryInterface.sequelize.QueryTypes.SELECT });

    // Every seeded student should read as having gone through the full
    // admission pipeline in the Directory (admissionStageFor in
    // students/service.js needs both a class assignment — already given
    // below — and an AdmissionPayment row to land on ADMITTED, the
    // "Fully admitted" badge, instead of stalling at the CLASS_ASSIGNED
    // "Admitted" one). cashAccountId is left null (same as any pre-ledger
    // historical payment — see models/admissionpayment.js) since no cash
    // account is seeded by default; the Directory only checks for the
    // payment row's existence, not its GL posting.
    const [[admissionFeeType]] = await queryInterface.sequelize.query(`
      SELECT TOP 1 id FROM fee_types WHERE schoolId = :schoolId AND category = 'ADMISSION'
    `, { replacements: { schoolId: school.schoolId } });
    if (!admissionFeeType) throw new Error('No ADMISSION fee type found for this school — run the school seeder first');

    const [[{ studentCount }]] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS studentCount FROM students WHERE schoolId = :schoolId',
      { replacements: { schoolId: school.schoolId } },
    );

    const studentNumberYear = new Date().getFullYear();
    let nextStudentSeq = Number(studentCount) + 1;
    let phoneSeq = 1;
    const admissionDate = school.academicYearStart instanceof Date
      ? school.academicYearStart.toISOString().slice(0, 10)
      : String(school.academicYearStart).slice(0, 10);

    const now = new Date();
    const studentRows = [];
    const assignmentRows = [];
    const parentRows = [];
    const studentParentRows = [];
    const admissionPaymentRows = [];
    const admissionPaymentItemRows = [];

    for (const klass of classes) {
      const [minAge, maxAge] = LEVEL_AGE_RANGES[klass.levelName] || [6, 15];
      const targetCount = 10;

      for (let i = 0; i < targetCount; i += 1) {
        const gender = Math.random() < 0.5 ? 'MALE' : 'FEMALE';
        const firstName = gender === 'MALE' ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);
        const lastName = pick(LAST_NAMES);
        const birthYear = studentNumberYear - randomInt(minAge, maxAge);
        const studentId = randomUUID();

        const fatherPhone = `024${String(phoneSeq).padStart(7, '0')}`;
        const motherPhone = `020${String(phoneSeq).padStart(7, '0')}`;
        phoneSeq += 1;

        studentRows.push({
          id: studentId,
          schoolId: school.schoolId,
          studentNumber: `${school.schoolCode}-${studentNumberYear}-${String(nextStudentSeq).padStart(6, '0')}`,
          firstName,
          middleName: null,
          lastName,
          gender,
          dateOfBirth: randomDateOnly(birthYear),
          emergencyContactName: `Mr. ${lastName}`,
          emergencyContactPhone: fatherPhone,
          emergencyContactRelationship: 'Parent',
          address: pick(ADDRESSES),
          admissionDate,
          status: 'ACTIVE',
          statusDate: null,
          statusNote: MARKER,
          photoUrl: null,
          createdAt: now,
          updatedAt: now,
        });
        nextStudentSeq += 1;

        const fatherId = randomUUID();
        const motherId = randomUUID();
        parentRows.push(
          {
            id: fatherId, schoolId: school.schoolId, fullName: `Mr. ${lastName}`, phone: fatherPhone, email: null, createdAt: now, updatedAt: now,
          },
          {
            id: motherId, schoolId: school.schoolId, fullName: `Mrs. ${lastName}`, phone: motherPhone, email: null, createdAt: now, updatedAt: now,
          },
        );
        studentParentRows.push(
          {
            id: randomUUID(), schoolId: school.schoolId, studentId, parentId: fatherId, relationship: 'FATHER', createdAt: now, updatedAt: now,
          },
          {
            id: randomUUID(), schoolId: school.schoolId, studentId, parentId: motherId, relationship: 'MOTHER', createdAt: now, updatedAt: now,
          },
        );

        assignmentRows.push({
          id: randomUUID(),
          schoolId: school.schoolId,
          studentId,
          classId: klass.classId,
          academicYearId: school.academicYearId,
          createdAt: now,
          updatedAt: now,
        });

        const admissionPaymentId = randomUUID();
        admissionPaymentRows.push({
          id: admissionPaymentId,
          schoolId: school.schoolId,
          studentId,
          amountPesewas: ADMISSION_FEE_PESEWAS,
          method: 'CASH',
          reference: null,
          paidDate: admissionDate,
          notes: MARKER,
          cashAccountId: null,
          createdAt: now,
          updatedAt: now,
        });
        admissionPaymentItemRows.push({
          id: randomUUID(),
          schoolId: school.schoolId,
          admissionPaymentId,
          feeTypeId: admissionFeeType.id,
          amountPesewas: ADMISSION_FEE_PESEWAS,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await queryInterface.bulkInsert('students', studentRows);
    await queryInterface.bulkInsert('parents', parentRows);
    await queryInterface.bulkInsert('student_parents', studentParentRows);
    await queryInterface.bulkInsert('student_class_assignments', assignmentRows);
    await queryInterface.bulkInsert('admission_payments', admissionPaymentRows);
    await queryInterface.bulkInsert('admission_payment_items', admissionPaymentItemRows);
  },

  down: async (queryInterface) => {
    const parentIdRows = await queryInterface.sequelize.query(`
      SELECT parentId FROM student_parents
      WHERE studentId IN (SELECT id FROM students WHERE statusNote = :marker)
    `, { replacements: { marker: MARKER }, type: queryInterface.sequelize.QueryTypes.SELECT });

    await queryInterface.sequelize.query(`
      DELETE FROM student_parents
      WHERE studentId IN (SELECT id FROM students WHERE statusNote = :marker)
    `, { replacements: { marker: MARKER } });

    if (parentIdRows.length > 0) {
      await queryInterface.sequelize.query(
        'DELETE FROM parents WHERE id IN (:parentIds)',
        { replacements: { parentIds: parentIdRows.map((r) => r.parentId) } },
      );
    }

    await queryInterface.sequelize.query(`
      DELETE FROM student_class_assignments
      WHERE studentId IN (SELECT id FROM students WHERE statusNote = :marker)
    `, { replacements: { marker: MARKER } });
    await queryInterface.sequelize.query(`
      DELETE FROM admission_payment_items
      WHERE admissionPaymentId IN (SELECT id FROM admission_payments WHERE notes = :marker)
    `, { replacements: { marker: MARKER } });
    await queryInterface.sequelize.query(
      'DELETE FROM admission_payments WHERE notes = :marker',
      { replacements: { marker: MARKER } },
    );
    await queryInterface.sequelize.query(
      'DELETE FROM students WHERE statusNote = :marker',
      { replacements: { marker: MARKER } },
    );
  },
};
