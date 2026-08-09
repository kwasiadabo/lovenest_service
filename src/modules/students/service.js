const { Op } = require('sequelize');
const {
  sequelize, Student, StudentClassAssignment, Class, Level, AcademicYear, Term, Parent, StudentParent,
  AdmissionPayment, AdmissionPaymentItem, FeeType, School, CashAccount, Staff, ClassTeacher,
  MessageRecipient, MessageBatch, PromotionBatch, PromotionBatchItem, User,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const usersService = require('../users/service');
const { postJournalEntry, reverseEntryFor } = require('../accounting/ledgerPoster');
const { FEE_CATEGORY_ACCOUNT_CODES } = require('../../utils/defaultChartOfAccounts');
const { resolveParentRecipients } = require('../messaging/recipients');
const { sendBatch } = require('../messaging/service');
const { notifyPreschoolProspectus } = require('./notify');

const assignmentInclude = [
  { model: Class, include: [Level] },
  AcademicYear,
];

async function getCurrentAcademicYear(schoolId) {
  const year = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  if (!year) throw new ApiError(400, 'No current academic year is set. Set one under Academic Years first.');
  return year;
}

// ---- Parents ----
// Father/mother are stored as normalized Parent records rather than plain
// text on the student, keyed by phone number within the school — enrolling
// a sibling with the same parent phone links to the same Parent row instead
// of duplicating it, which is what lets childrenCount below work.

async function upsertParentLink(schoolId, studentId, relationship, info) {
  const existingLink = await tenantScoped(StudentParent, schoolId).findOne({ where: { studentId, relationship } });

  if (!info?.name || !info?.phone) {
    if (existingLink) await tenantScoped(StudentParent, schoolId).destroy({ where: { id: existingLink.id } });
    return;
  }

  let parent = await tenantScoped(Parent, schoolId).findOne({ where: { phone: info.phone } });
  if (parent) {
    await parent.update({ fullName: info.name, email: info.email || null });
  } else {
    parent = await tenantScoped(Parent, schoolId).create({ fullName: info.name, phone: info.phone, email: info.email || null });
  }

  if (existingLink) {
    existingLink.parentId = parent.id;
    await existingLink.save();
  } else {
    await tenantScoped(StudentParent, schoolId).create({ studentId, parentId: parent.id, relationship });
  }
}

// Batches parent lookup + sibling counts across a list of students, rather
// than querying per-row.
async function attachParents(schoolId, students) {
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return [];

  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId: studentIds },
    include: [Parent],
  });

  const parentIds = [...new Set(links.map((l) => l.parentId))];
  const countRows = parentIds.length
    ? await tenantScoped(StudentParent, schoolId).findAll({
      where: { parentId: parentIds },
      attributes: ['parentId', [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('studentId'))), 'childrenCount']],
      group: ['parentId'],
    })
    : [];
  const countByParentId = new Map(countRows.map((r) => [r.parentId, Number(r.get('childrenCount'))]));

  const linksByStudentId = new Map();
  links.forEach((link) => {
    if (!linksByStudentId.has(link.studentId)) linksByStudentId.set(link.studentId, []);
    linksByStudentId.get(link.studentId).push(link);
  });

  const toParentView = (link) => ({
    id: link.Parent.id,
    fullName: link.Parent.fullName,
    phone: link.Parent.phone,
    email: link.Parent.email,
    childrenCount: countByParentId.get(link.Parent.id) || 0,
    hasLogin: !!link.Parent.userId,
  });

  return students.map((student) => {
    const studentLinks = linksByStudentId.get(student.id) || [];
    return {
      ...student.toJSON(),
      father: (studentLinks.find((l) => l.relationship === 'FATHER') && toParentView(studentLinks.find((l) => l.relationship === 'FATHER'))) || null,
      mother: (studentLinks.find((l) => l.relationship === 'MOTHER') && toParentView(studentLinks.find((l) => l.relationship === 'MOTHER'))) || null,
    };
  });
}

async function resolveParentForRelationship(schoolId, studentId, relationship) {
  const link = await tenantScoped(StudentParent, schoolId).findOne({
    where: { studentId, relationship },
    include: [Parent],
  });
  if (!link) throw new ApiError(404, `No ${relationship.toLowerCase()} is linked to this student yet.`);
  return link.Parent;
}

// Reuses users/service.js#createUser's exact mechanics (default password,
// forcePasswordChange: true, role assignment) so a parent login behaves
// identically to a staff invite. Requires an email on file — parent portal
// login goes through the same email/password auth as every other role
// (User.email is platform-wide unique), rather than adding a second
// phone-based login mechanism just for parents.
async function createParentLogin(schoolId, studentId, relationship) {
  const parent = await resolveParentForRelationship(schoolId, studentId, relationship);
  if (!parent.email) {
    throw new ApiError(400, 'This parent has no email on file. Add one before creating a portal login.');
  }
  if (parent.userId) {
    throw new ApiError(409, 'This parent already has a portal login. Use "Reset password" instead.');
  }

  const created = await usersService.createUser(schoolId, {
    fullName: parent.fullName, email: parent.email, roles: ['PARENT'],
  });
  await parent.update({ userId: created.id });
  return created;
}

async function resetParentLoginPassword(schoolId, studentId, relationship) {
  const parent = await resolveParentForRelationship(schoolId, studentId, relationship);
  if (!parent.userId) throw new ApiError(400, 'This parent does not have a portal login yet.');
  return usersService.resetUserPassword(schoolId, parent.userId);
}

// ---- Admission payments ----
// One-off admission fee, recorded manually by the admin (cash/mobile
// money/bank) rather than collected through a payment gateway — unrelated
// to the Payment model, which is the school's own SaaS subscription billing.

// Class assignment now happens before the admission fee payment in the
// wizard, so a student is only fully ADMITTED once both are in place —
// class assignment alone lands them in the intermediate CLASS_ASSIGNED stage.
function admissionStageFor(hasClassAssignment, hasPayment) {
  if (hasClassAssignment && hasPayment) return 'ADMITTED';
  if (hasClassAssignment) return 'CLASS_ASSIGNED';
  return 'ENROLLED';
}

async function attachAdmissionPayments(schoolId, students) {
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return new Map();

  const payments = await tenantScoped(AdmissionPayment, schoolId).findAll({
    where: { studentId: studentIds },
    include: [{ model: AdmissionPaymentItem, as: 'items', include: [FeeType] }],
  });
  return new Map(payments.map((p) => [p.studentId, p]));
}

// Fees selected at admission time are recorded as line items (one per fee
// type the admin ticked, e.g. Admission Fee + PTA Dues) rather than a single
// flat amount, so re-recording a payment replaces the whole item set instead
// of just overwriting a total.
// Cash-basis, straight to income — there's no "admission bill" step, the
// fee is billed and paid in the same instant. Idempotent reverse-and-repost
// keyed on the AdmissionPayment's own id, which is stable across the
// find-or-create upsert above (unlike Bill/Levy payments, admission
// payments have no separate edit endpoint — every call to
// recordAdmissionPayment IS the edit).
async function postAdmissionPayment(schoolId, payment, items, userId, transaction) {
  await reverseEntryFor(schoolId, 'ADMISSION_PAYMENT', payment.id, { userId, reason: 'Admission payment updated' }, transaction);

  const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(payment.cashAccountId, { transaction });
  if (!cashAccount) throw new ApiError(400, 'cashAccountId does not refer to a valid cash account');

  const feeTypeIds = [...new Set(items.map((item) => item.feeTypeId))];
  const feeTypes = await tenantScoped(FeeType, schoolId).findAll({ where: { id: feeTypeIds }, transaction });
  const categoryByFeeTypeId = new Map(feeTypes.map((ft) => [ft.id, ft.category]));

  const incomeByCategory = {};
  items.forEach((item) => {
    const category = categoryByFeeTypeId.get(item.feeTypeId) || 'OTHER';
    incomeByCategory[category] = (incomeByCategory[category] || 0) + Number(item.amountPesewas);
  });

  const lines = [
    { accountId: cashAccount.accountId, debitPesewas: payment.amountPesewas, studentId: payment.studentId },
    ...Object.entries(incomeByCategory).map(([category, amountPesewas]) => ({
      accountCode: FEE_CATEGORY_ACCOUNT_CODES[category] || FEE_CATEGORY_ACCOUNT_CODES.OTHER,
      creditPesewas: amountPesewas,
      studentId: payment.studentId,
    })),
  ];

  await postJournalEntry(schoolId, {
    entryDate: payment.paidDate,
    description: 'Admission payment received',
    sourceType: 'ADMISSION_PAYMENT',
    sourceId: payment.id,
    userId,
    lines,
  }, transaction);
}

async function recordAdmissionPayment(schoolId, studentId, userId, {
  items, method, reference, paidDate, notes, cashAccountId,
}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const amountPesewas = items.reduce((sum, item) => sum + Number(item.amountPesewas), 0);

  // Tracks whether this call is the one that completes admission (transitions
  // a CLASS_ASSIGNED student to ADMITTED, per admissionStageFor above) rather
  // than a correction to an already-recorded payment — the prospectus email
  // below should only ever fire once, on that transition.
  let wasFirstPayment = false;

  const result = await sequelize.transaction(async (transaction) => {
    const existing = await tenantScoped(AdmissionPayment, schoolId).findOne({ where: { studentId }, transaction });
    wasFirstPayment = !existing;
    const fields = {
      amountPesewas,
      method,
      reference: reference || null,
      paidDate,
      notes: notes || null,
      cashAccountId,
    };

    const payment = existing
      ? await existing.update(fields, { transaction })
      : await tenantScoped(AdmissionPayment, schoolId).create({ studentId, ...fields }, { transaction });

    await tenantScoped(AdmissionPaymentItem, schoolId).destroy({ where: { admissionPaymentId: payment.id }, transaction });
    await tenantScoped(AdmissionPaymentItem, schoolId).bulkCreate(
      items.map((item) => ({ admissionPaymentId: payment.id, feeTypeId: item.feeTypeId, amountPesewas: item.amountPesewas })),
      { transaction },
    );

    await postAdmissionPayment(schoolId, payment, items, userId, transaction);

    return tenantScoped(AdmissionPayment, schoolId).findByPk(payment.id, {
      include: [{ model: AdmissionPaymentItem, as: 'items', include: [FeeType] }],
      transaction,
    });
  });

  if (wasFirstPayment) {
    // Best-effort, outside the transaction and never allowed to affect the
    // response — same convention as financials/service.js#recordPayment's
    // notifyPaymentReceipt call.
    try {
      const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
      const currentClassAssignment = currentYear
        ? await tenantScoped(StudentClassAssignment, schoolId).findOne({
          where: { studentId, academicYearId: currentYear.id },
          include: [{ model: Class, include: [Level] }],
        })
        : null;
      const category = currentClassAssignment?.Class?.Level?.category;
      if (category === 'NURSERY' || category === 'KG') {
        const school = await School.findByPk(schoolId);
        await notifyPreschoolProspectus(schoolId, { school, student });
      }
    } catch {
      // Swallowed — a failed prospectus email must never fail an admission
      // payment that's already recorded, same as notifyPaymentReceipt.
    }
  }

  return result;
}

// Every admission fee payment ever recorded, optionally scoped by date range
// and level/class — same shape/convention as financials/service.js#listPayments
// (payments aren't tied to a class themselves, so each is matched against the
// paying student's *current-year* class assignment, not whatever class they
// were in when they paid).
async function getAdmissionPaymentsReport(schoolId, {
  from, to, levelId, classId,
} = {}) {
  const where = {};
  if (from && to) where.paidDate = { [Op.between]: [from, to] };
  else if (from) where.paidDate = { [Op.gte]: from };
  else if (to) where.paidDate = { [Op.lte]: to };

  let payments = await tenantScoped(AdmissionPayment, schoolId).findAll({
    where,
    include: [
      Student,
      { model: AdmissionPaymentItem, as: 'items', include: [FeeType] },
      { model: CashAccount, as: 'cashAccount' },
    ],
    order: [['paidDate', 'DESC'], ['createdAt', 'DESC']],
  });

  const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  const assignments = currentYear && payments.length > 0
    ? await tenantScoped(StudentClassAssignment, schoolId).findAll({
      where: { academicYearId: currentYear.id, studentId: payments.map((p) => p.studentId) },
      include: [{ model: Class, include: [Level] }],
    })
    : [];
  const assignmentByStudentId = new Map(assignments.map((a) => [a.studentId, a]));

  payments = payments.map((p) => {
    const assignment = assignmentByStudentId.get(p.studentId);
    return {
      ...p.toJSON(),
      classInfo: assignment ? {
        classId: assignment.Class.id,
        className: assignment.Class.name,
        levelId: assignment.Class.levelId,
        levelName: assignment.Class.Level?.name,
      } : null,
    };
  });

  if (levelId || classId) {
    payments = payments.filter((p) => {
      if (classId) return p.classInfo?.classId === classId;
      return p.classInfo?.levelId === levelId;
    });
  }

  return {
    payments,
    totalPesewas: payments.reduce((sum, p) => sum + p.amountPesewas, 0),
  };
}

// ---- Students ----

async function listStudents(schoolId, { status } = {}) {
  const students = await tenantScoped(Student, schoolId).findAll({
    // Excludes every row still sitting in the public admissions pipeline
    // (see models/student.js) — a submitted-but-not-yet-accepted applicant
    // must never surface in ordinary rosters, billing, or attendance. Once
    // accepted, applicantStatus is 'ACCEPTED' (not cleared to null), so both
    // values must be allowed here — plain applicantStatus: null would also
    // need this same [Op.or] shape, since SQL's three-valued logic makes
    // `<> 'ACCEPTED'` silently drop every NULL row too.
    // admissions/service.js queries Student directly (bypassing this
    // function) for its own applicant-only views.
    where: {
      ...(status ? { status } : undefined),
      [Op.or]: [{ applicantStatus: null }, { applicantStatus: 'ACCEPTED' }],
    },
    // selfDismissalSetBy: just enough to show "set by {name}" on the Pickup
    // & Dismissal section without a separate round trip.
    include: [{ model: User, as: 'selfDismissalSetBy', attributes: ['id', 'fullName'] }],
    order: [['lastName', 'ASC'], ['firstName', 'ASC']],
  });

  const withParents = await attachParents(schoolId, students);
  const paymentsByStudentId = await attachAdmissionPayments(schoolId, students);

  const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  const assignments = currentYear && students.length > 0
    ? await tenantScoped(StudentClassAssignment, schoolId).findAll({
      where: { academicYearId: currentYear.id, studentId: students.map((s) => s.id) },
      include: [{ model: Class, include: [Level] }],
    })
    : [];
  const assignmentByStudentId = new Map(assignments.map((a) => [a.studentId, a]));

  return withParents.map((student) => {
    const admissionPayment = paymentsByStudentId.get(student.id) || null;
    const currentClassAssignment = assignmentByStudentId.get(student.id) || null;
    return {
      ...student,
      admissionPayment,
      currentClassAssignment,
      admissionStage: admissionStageFor(!!currentClassAssignment, !!admissionPayment),
    };
  });
}

// {SCHOOL_CODE}-{YEAR}-{SEQUENCE}, e.g. "UG-2026-004501". The sequence is
// derived from the highest existing suffix for this school+year rather than
// a row count — a count-based scheme desyncs (and then permanently collides
// on every future create) the moment a student is deleted, same reasoning as
// bill payment receipt numbers (see financials/service.js).
async function generateStudentNumber(schoolId) {
  const school = await School.findByPk(schoolId);
  if (!school) throw new ApiError(404, 'School not found');

  const year = new Date().getFullYear();
  const prefix = `${school.code}-${year}-`;

  const existing = await tenantScoped(Student, schoolId).findAll({
    where: { studentNumber: { [Op.like]: `${prefix}%` } },
    attributes: ['studentNumber'],
  });
  const suffixPattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  const maxSeq = existing.reduce((max, s) => {
    const match = suffixPattern.exec(s.studentNumber);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `${prefix}${String(maxSeq + 1).padStart(6, '0')}`;
}

// Race-prone under concurrent admissions for the same school (not a DB
// sequence) — retried once on a unique-constraint collision, same pattern as
// createBillPaymentWithReceipt.
async function createStudentWithNumber(schoolId, studentFields, photoUrl) {
  try {
    const studentNumber = await generateStudentNumber(schoolId);
    return await tenantScoped(Student, schoolId).create({ ...studentFields, studentNumber, photoUrl: photoUrl || null });
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    const studentNumber = await generateStudentNumber(schoolId);
    return tenantScoped(Student, schoolId).create({ ...studentFields, studentNumber, photoUrl: photoUrl || null });
  }
}

async function createStudent(schoolId, data, photoUrl) {
  const { father, mother, ...studentFields } = data;
  const student = await createStudentWithNumber(schoolId, studentFields, photoUrl);

  await upsertParentLink(schoolId, student.id, 'FATHER', father);
  await upsertParentLink(schoolId, student.id, 'MOTHER', mother);

  const [withParents] = await attachParents(schoolId, [student]);
  return { ...withParents, admissionPayment: null, currentClassAssignment: null, admissionStage: 'ENROLLED' };
}

async function updateStudent(schoolId, studentId, data, photoUrl) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const { father, mother, ...studentFields } = data;
  await student.update({ ...studentFields, ...(photoUrl ? { photoUrl } : {}) });

  await upsertParentLink(schoolId, student.id, 'FATHER', father);
  await upsertParentLink(schoolId, student.id, 'MOTHER', mother);

  const [withParents] = await attachParents(schoolId, [student]);
  const paymentsByStudentId = await attachAdmissionPayments(schoolId, [student]);
  const admissionPayment = paymentsByStudentId.get(student.id) || null;

  const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  const currentClassAssignment = currentYear
    ? await tenantScoped(StudentClassAssignment, schoolId).findOne({
      where: { studentId: student.id, academicYearId: currentYear.id },
      include: [{ model: Class, include: [Level] }],
    })
    : null;

  return {
    ...withParents,
    admissionPayment,
    currentClassAssignment,
    admissionStage: admissionStageFor(!!currentClassAssignment, !!admissionPayment),
  };
}

async function setStudentStatus(schoolId, studentId, { status, statusDate, statusNote }) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
  if (!Student.STATUSES.includes(status)) throw new ApiError(400, `status must be one of: ${Student.STATUSES.join(', ')}`);

  await student.update({ status, statusDate: statusDate || null, statusNote: statusNote || null });
  return student;
}

// A standalone, on-demand graduation action (e.g. for a school's JHS 3
// cohort) — independent of the year-end confirmPromotion flow below, which
// only graduates a class as a side effect of a whole-school promotion run.
// status is hardcoded here, never client-supplied, so this endpoint can't
// be used to set an arbitrary status.
async function graduateStudents(schoolId, { studentIds, statusDate }) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new ApiError(400, 'studentIds must be a non-empty array');
  }
  if (!statusDate) throw new ApiError(400, 'statusDate is required');

  const students = await tenantScoped(Student, schoolId).findAll({ where: { id: studentIds } });
  if (students.length !== studentIds.length) throw new ApiError(404, 'One or more students not found');

  for (const student of students) {
    // eslint-disable-next-line no-await-in-loop -- same convention as confirmPromotion's loop
    await student.update({ status: 'GRADUATED', statusDate, statusNote: null });
  }

  return { graduatedCount: students.length };
}

// discountType null clears the discount entirely; otherwise exactly one of
// discountPercent/discountFlatPesewas is meaningful (validated upstream) and
// the other is cleared, so a stale value from a previous type never lingers.
async function setStudentDiscount(schoolId, studentId, {
  discountType, discountPercent, discountFlatPesewas, discountReason,
}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  if (!discountType) {
    await student.update({
      individualDiscountType: null,
      individualDiscountPercent: null,
      individualDiscountFlatPesewas: null,
      individualDiscountReason: null,
    });
    return student;
  }

  await student.update({
    individualDiscountType: discountType,
    individualDiscountPercent: discountType === 'PERCENT' ? Number(discountPercent) : null,
    individualDiscountFlatPesewas: discountType === 'FLAT' ? Number(discountFlatPesewas) : null,
    individualDiscountReason: discountReason?.trim() || null,
  });
  return student;
}

// A deliberate safeguarding sign-off (see gateLog/service.js's missed-pickup
// sweep, which excludes self-dismissal-authorized students entirely) —
// SCHOOL_ADMIN-only at the route level (routes.js), not the customizable
// `students` permission matrix, since a wrong toggle here has physical-
// safety consequences. Always stamps who/when, even when turning it off.
async function setStudentSelfDismissal(schoolId, studentId, userId, { selfDismissalAuthorized, selfDismissalNote }) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  await student.update({
    selfDismissalAuthorized,
    selfDismissalNote: selfDismissalAuthorized ? (selfDismissalNote?.trim() || null) : null,
    selfDismissalSetByUserId: userId,
    selfDismissalSetAt: new Date(),
  });
  return student;
}

// ---- Class assignments ----

async function listClassAssignments(schoolId, { academicYearId, classId } = {}) {
  const year = academicYearId
    ? await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId)
    : await getCurrentAcademicYear(schoolId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  return tenantScoped(StudentClassAssignment, schoolId).findAll({
    where: { academicYearId: year.id, ...(classId ? { classId } : {}) },
    include: [Student, ...assignmentInclude],
    order: [[Student, 'lastName', 'ASC'], [Student, 'firstName', 'ASC']],
  });
}

async function assignStudentToClass(schoolId, { studentId, classId, academicYearId }) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
  if (student.status !== 'ACTIVE') throw new ApiError(400, 'Only active students can be assigned to a class');

  const klass = await tenantScoped(Class, schoolId).findByPk(classId);
  if (!klass) throw new ApiError(404, 'Class not found');

  const year = academicYearId
    ? await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId)
    : await getCurrentAcademicYear(schoolId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  const existing = await tenantScoped(StudentClassAssignment, schoolId).findOne({
    where: { studentId, academicYearId: year.id },
  });

  if (existing) {
    existing.classId = classId;
    await existing.save();
  }

  const assignment = existing || await tenantScoped(StudentClassAssignment, schoolId).create({
    studentId,
    classId,
    academicYearId: year.id,
  });

  return tenantScoped(StudentClassAssignment, schoolId).findByPk(assignment.id, {
    include: [Student, ...assignmentInclude],
  });
}

async function removeClassAssignment(schoolId, id) {
  const deleted = await tenantScoped(StudentClassAssignment, schoolId).destroy({ where: { id } });
  if (!deleted) throw new ApiError(404, 'Assignment not found');
}

// ---- Promotion ----
// Two paths share the same validation (year-ordering + third-term gate):
// the automated whole-school flow (getPromotionPreview/confirmPromotion),
// driven by each Class's nextClassId/isGraduatingClass mapping, and the
// manual/advanced single-class flow further down (promoteStudents), kept
// for one-off corrections. Every automated run is recorded as a
// PromotionBatch + PromotionBatchItem rows for history/analytics — the
// manual flow isn't, since it's a correction tool, not the year-end event.

// "Current term" is a manually-flagged row (Term.isCurrent), not computed
// from today's date — see academic/service.js#setCurrentTerm. Promotion is
// only allowed while that flagged term is sequence 3 ("third term").
async function assertPromotionWindowOpen(schoolId) {
  const currentTerm = await tenantScoped(Term, schoolId).findOne({ where: { isCurrent: true } });
  if (!currentTerm) {
    throw new ApiError(400, 'No current term is set. Set one under Academic Setup first.');
  }
  if (currentTerm.sequence !== 3) {
    throw new ApiError(400, `Promotions can only be run in the third term. The current term is "${currentTerm.name}".`);
  }
  return currentTerm;
}

// The academic year immediately following the current one, by startDate —
// not just "any later year," so automated promotion always lands students
// in the very next year rather than skipping ahead.
async function resolveNextAcademicYear(schoolId, fromYear) {
  const nextYear = await tenantScoped(AcademicYear, schoolId).findOne({
    where: { startDate: { [Op.gt]: fromYear.startDate } },
    order: [['startDate', 'ASC']],
  });
  if (!nextYear) {
    throw new ApiError(400, 'No academic year exists after the current one yet — create it under Academic Setup first.');
  }
  return nextYear;
}

// ---- Automated whole-school promotion ----

async function getPromotionPreview(schoolId) {
  const fromYear = await getCurrentAcademicYear(schoolId);

  let currentTerm;
  let toYear;
  try {
    currentTerm = await assertPromotionWindowOpen(schoolId);
    toYear = await resolveNextAcademicYear(schoolId, fromYear);
  } catch (err) {
    return { open: false, reason: err.message, fromAcademicYear: fromYear };
  }

  const classes = await tenantScoped(Class, schoolId).findAll({
    include: [Level, { model: Class, as: 'nextClass' }],
    order: [['name', 'ASC']],
  });

  const assignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
    where: { academicYearId: fromYear.id },
    include: [{ model: Student, where: { status: 'ACTIVE' } }],
  });
  const studentsByClassId = new Map();
  for (const assignment of assignments) {
    const list = studentsByClassId.get(assignment.classId) || [];
    list.push({
      id: assignment.Student.id, fullName: assignment.Student.fullName, studentNumber: assignment.Student.studentNumber,
    });
    studentsByClassId.set(assignment.classId, list);
  }

  return {
    open: true,
    fromAcademicYear: fromYear,
    toAcademicYear: toYear,
    currentTerm,
    classes: classes.map((klass) => ({
      classId: klass.id,
      className: klass.name,
      levelName: klass.Level?.name,
      nextClass: klass.nextClass ? { id: klass.nextClass.id, name: klass.nextClass.name } : null,
      isGraduatingClass: klass.isGraduatingClass,
      configured: klass.isGraduatingClass || !!klass.nextClassId,
      students: (studentsByClassId.get(klass.id) || []).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    })),
  };
}

async function confirmPromotion(schoolId, userId, { studentIds }) {
  const fromYear = await getCurrentAcademicYear(schoolId);
  await assertPromotionWindowOpen(schoolId);
  const toYear = await resolveNextAcademicYear(schoolId, fromYear);

  const assignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
    where: { academicYearId: fromYear.id, studentId: studentIds },
    include: [Student, { model: Class, include: [{ model: Class, as: 'nextClass' }] }],
  });
  const assignmentByStudentId = new Map(assignments.map((a) => [a.studentId, a]));

  const items = [];
  let promotedCount = 0;
  let graduatedCount = 0;
  let skippedCount = 0;

  for (const studentId of studentIds) {
    const assignment = assignmentByStudentId.get(studentId);
    if (!assignment || !assignment.Student || assignment.Student.status !== 'ACTIVE') {
      skippedCount += 1;
      items.push({
        studentId, fromClassId: assignment?.classId || null, toClassId: null, outcome: 'SKIPPED', skipReason: 'Not actively assigned to a class this year',
      });
      continue;
    }

    const fromClass = assignment.Class;
    if (fromClass.isGraduatingClass) {
      // eslint-disable-next-line no-await-in-loop
      await assignment.Student.update({ status: 'GRADUATED', statusDate: new Date().toISOString().slice(0, 10) });
      graduatedCount += 1;
      items.push({
        studentId, fromClassId: fromClass.id, toClassId: null, outcome: 'GRADUATED', skipReason: null,
      });
    } else if (fromClass.nextClassId) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await tenantScoped(StudentClassAssignment, schoolId).findOne({
        where: { studentId, academicYearId: toYear.id },
      });
      if (existing) {
        existing.classId = fromClass.nextClassId;
        // eslint-disable-next-line no-await-in-loop
        await existing.save();
      } else {
        // eslint-disable-next-line no-await-in-loop
        await tenantScoped(StudentClassAssignment, schoolId).create({
          studentId, classId: fromClass.nextClassId, academicYearId: toYear.id,
        });
      }
      promotedCount += 1;
      items.push({
        studentId, fromClassId: fromClass.id, toClassId: fromClass.nextClassId, outcome: 'PROMOTED', skipReason: null,
      });
    } else {
      skippedCount += 1;
      items.push({
        studentId, fromClassId: fromClass.id, toClassId: null, outcome: 'SKIPPED', skipReason: 'No promotion mapping configured for this class',
      });
    }
  }

  const batch = await tenantScoped(PromotionBatch, schoolId).create({
    fromAcademicYearId: fromYear.id,
    toAcademicYearId: toYear.id,
    runByUserId: userId,
    promotedCount,
    graduatedCount,
    skippedCount,
  });

  if (items.length > 0) {
    await tenantScoped(PromotionBatchItem, schoolId).bulkCreate(
      items.map((item) => ({ ...item, promotionBatchId: batch.id })),
    );
  }

  return {
    batchId: batch.id, promotedCount, graduatedCount, skippedCount,
  };
}

// ---- Promotion history / analytics ----

const BATCH_SUMMARY_INCLUDE = [
  { model: AcademicYear, as: 'fromAcademicYear' },
  { model: AcademicYear, as: 'toAcademicYear' },
  { model: User, as: 'runBy', attributes: ['id', 'fullName', 'email'] },
];

async function listPromotionBatches(schoolId) {
  return tenantScoped(PromotionBatch, schoolId).findAll({
    include: BATCH_SUMMARY_INCLUDE,
    order: [['createdAt', 'DESC']],
  });
}

async function getPromotionBatchDetail(schoolId, batchId) {
  const batch = await tenantScoped(PromotionBatch, schoolId).findByPk(batchId, { include: BATCH_SUMMARY_INCLUDE });
  if (!batch) throw new ApiError(404, 'Promotion batch not found');

  const items = await tenantScoped(PromotionBatchItem, schoolId).findAll({
    where: { promotionBatchId: batchId },
    include: [
      Student,
      { model: Class, as: 'fromClass', include: [Level] },
      { model: Class, as: 'toClass' },
    ],
    order: [['createdAt', 'ASC']],
  });

  const byClassMap = new Map();
  for (const item of items) {
    const key = item.fromClassId;
    const entry = byClassMap.get(key) || {
      classId: key,
      className: item.fromClass?.name,
      levelName: item.fromClass?.Level?.name,
      promotedCount: 0,
      graduatedCount: 0,
      skippedCount: 0,
    };
    if (item.outcome === 'PROMOTED') entry.promotedCount += 1;
    else if (item.outcome === 'GRADUATED') entry.graduatedCount += 1;
    else entry.skippedCount += 1;
    byClassMap.set(key, entry);
  }

  return {
    batch,
    byClass: [...byClassMap.values()].sort((a, b) => (a.className || '').localeCompare(b.className || '')),
    items: items.map((item) => ({
      studentId: item.studentId,
      studentName: item.Student?.fullName,
      studentNumber: item.Student?.studentNumber,
      fromClassName: item.fromClass?.name,
      toClassName: item.toClass?.name || null,
      outcome: item.outcome,
      skipReason: item.skipReason,
    })),
  };
}

// ---- Manual / advanced promotion (single class, one-off corrections) ----
// Bulk-moves every actively-assigned student in one class/year into another
// class/year in a single request — a fresh row per student in the target
// year, leaving the source year's assignments untouched as history. Same
// year-ordering and third-term validation as the automated flow above, but
// not recorded as a PromotionBatch — this is a correction tool, not the
// year-end event.

async function promoteStudents(schoolId, { fromClassId, fromAcademicYearId, toClassId, toAcademicYearId }) {
  await assertPromotionWindowOpen(schoolId);

  const fromYear = await tenantScoped(AcademicYear, schoolId).findByPk(fromAcademicYearId);
  if (!fromYear) throw new ApiError(404, 'Source academic year not found');

  const toYear = await tenantScoped(AcademicYear, schoolId).findByPk(toAcademicYearId);
  if (!toYear) throw new ApiError(404, 'Target academic year not found');

  if (toYear.startDate <= fromYear.startDate) {
    throw new ApiError(400, 'The target academic year must be after the source year');
  }

  const toClass = await tenantScoped(Class, schoolId).findByPk(toClassId);
  if (!toClass) throw new ApiError(404, 'Target class not found');

  const sourceAssignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
    where: { classId: fromClassId, academicYearId: fromAcademicYearId },
    include: [Student],
  });

  const activeStudents = sourceAssignments
    .map((a) => a.Student)
    .filter((student) => student && student.status === 'ACTIVE');

  const results = [];
  for (const student of activeStudents) {
    const existing = await tenantScoped(StudentClassAssignment, schoolId).findOne({
      where: { studentId: student.id, academicYearId: toYear.id },
    });
    if (existing) {
      existing.classId = toClassId;
      await existing.save();
      results.push(existing);
    } else {
      results.push(await tenantScoped(StudentClassAssignment, schoolId).create({
        studentId: student.id,
        classId: toClassId,
        academicYearId: toYear.id,
      }));
    }
  }

  return { promotedCount: results.length, studentIds: activeStudents.map((s) => s.id) };
}

// ---- Birthdays ----

const BIRTHDAY_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Shared between getUpcomingBirthdays (to detect an already-sent message)
// and sendBirthdayMessage (to tag the send) — there's no distinct MessageBatch
// `source` value for birthdays (adding one means altering a live CHECK
// constraint on the mssql `source` column), so this literal subject is the
// marker that ties a MessageRecipient row back to "this was a birthday nudge."
const BIRTHDAY_MESSAGE_SUBJECT = 'Happy Birthday!';

// Same local-calendar-date parsing as formatDate.js's parseLocalDate on the
// frontend — a DATEONLY string must not round-trip through `new Date(...)`
// directly, which reads it as UTC and can roll the day back a day.
function parseDateOfBirth(value) {
  if (!value) return null;
  if (typeof value === 'string' && BIRTHDAY_DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextBirthdayInfo(dateOfBirth) {
  const dob = parseDateOfBirth(dateOfBirth);
  if (!dob) return null;

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(todayMidnight.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < todayMidnight) next = new Date(todayMidnight.getFullYear() + 1, dob.getMonth(), dob.getDate());

  const daysUntil = Math.round((next - todayMidnight) / (1000 * 60 * 60 * 24));
  const turningAge = next.getFullYear() - dob.getFullYear();
  return { date: next, daysUntil, turningAge };
}

// A plain TEACHER only sees birthdays for classes they're the ClassTeacher
// of (same scoping as attendance/service.js#getMyClasses) — SCHOOL_ADMIN and
// HEAD_TEACHER see the whole school.
async function getUpcomingBirthdays(schoolId, userId, roles, { days = 30 } = {}) {
  const isUnrestricted = roles.includes('SCHOOL_ADMIN') || roles.includes('HEAD_TEACHER');

  let allowedClassIds = null;
  if (!isUnrestricted) {
    const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
    if (!staffMember) return [];
    const assignments = await tenantScoped(ClassTeacher, schoolId).findAll({ where: { staffId: staffMember.id } });
    allowedClassIds = new Set(assignments.map((a) => a.classId));
    if (allowedClassIds.size === 0) return [];
  }

  const students = await listStudents(schoolId, { status: 'ACTIVE' });

  const due = students
    .filter((student) => !allowedClassIds || allowedClassIds.has(student.currentClassAssignment?.classId))
    .map((student) => ({
      id: student.id,
      fullName: student.fullName,
      studentNumber: student.studentNumber,
      photoUrl: student.photoUrl,
      dateOfBirth: student.dateOfBirth,
      className: student.currentClassAssignment ? classLabel(student.currentClassAssignment) : null,
      nextBirthday: nextBirthdayInfo(student.dateOfBirth),
    }))
    .filter((student) => student.nextBirthday && student.nextBirthday.daysUntil <= days);

  // A birthday message "already sent" is scoped to THIS upcoming occurrence,
  // not any birthday message ever sent to this student — a send logged for
  // last year's birthday shouldn't still flag this year's as done. Fetched
  // in one batched query (not per-student) and filtered against each
  // student's own cutoff (the day after their last occurrence) in memory.
  const dueStudentIds = due.map((student) => student.id);
  const sentRows = dueStudentIds.length > 0
    ? await tenantScoped(MessageRecipient, schoolId).findAll({
      where: {
        studentId: dueStudentIds,
        [Op.or]: [{ smsStatus: 'SENT' }, { emailStatus: 'SENT' }],
      },
      include: [{
        model: MessageBatch, as: 'batch', where: { subject: BIRTHDAY_MESSAGE_SUBJECT }, attributes: ['createdAt'],
      }],
    })
    : [];
  const sentDatesByStudentId = new Map();
  for (const row of sentRows) {
    const list = sentDatesByStudentId.get(row.studentId) || [];
    list.push(row.batch.createdAt);
    sentDatesByStudentId.set(row.studentId, list);
  }

  return due
    .map((student) => {
      const cutoff = new Date(student.nextBirthday.date);
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      cutoff.setDate(cutoff.getDate() + 1);
      const sentDates = (sentDatesByStudentId.get(student.id) || [])
        .filter((sentAt) => new Date(sentAt) >= cutoff)
        .sort((a, b) => new Date(b) - new Date(a));
      return { ...student, messageSentAt: sentDates[0] || null };
    })
    .sort((a, b) => a.nextBirthday.daysUntil - b.nextBirthday.daysUntil);
}

function classLabel(assignment) {
  if (!assignment.Class) return null;
  return assignment.Class.Level ? `${assignment.Class.name} (${assignment.Class.Level.name})` : assignment.Class.name;
}

// A plain TEACHER may only nudge parents of students in their own assigned
// classes (same scope as getUpcomingBirthdays) — SCHOOL_ADMIN/HEAD_TEACHER
// aren't restricted.
async function sendBirthdayMessage(schoolId, userId, roles, studentId, { message, smsRequested, emailRequested }) {
  const isUnrestricted = roles.includes('SCHOOL_ADMIN') || roles.includes('HEAD_TEACHER');
  if (!isUnrestricted) {
    const staffMember = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
    const assignment = await tenantScoped(StudentClassAssignment, schoolId).findOne({ where: { studentId } });
    const classTeacherRow = staffMember && assignment && await tenantScoped(ClassTeacher, schoolId).findOne({
      where: { staffId: staffMember.id, classId: assignment.classId },
    });
    if (!classTeacherRow) {
      throw new ApiError(403, 'You are not the class teacher for this student.');
    }
  }

  const recipients = await resolveParentRecipients(schoolId, { studentIds: [studentId] });
  if (recipients.length === 0) {
    throw new ApiError(400, 'No parent contact found for this student.');
  }

  return sendBatch(schoolId, {
    sentByUserId: userId,
    audience: 'PARENTS',
    source: 'COMPOSE',
    smsRequested,
    emailRequested,
    subject: BIRTHDAY_MESSAGE_SUBJECT,
    messageTemplate: message,
    recipients,
    extraRecipientFields: () => ({ studentId }),
  });
}

module.exports = {
  listStudents,
  createStudent,
  updateStudent,
  setStudentStatus,
  graduateStudents,
  setStudentDiscount,
  setStudentSelfDismissal,
  recordAdmissionPayment,
  getAdmissionPaymentsReport,
  listClassAssignments,
  assignStudentToClass,
  removeClassAssignment,
  getPromotionPreview,
  confirmPromotion,
  listPromotionBatches,
  getPromotionBatchDetail,
  promoteStudents,
  createParentLogin,
  resetParentLoginPassword,
  getUpcomingBirthdays,
  sendBirthdayMessage,
  // Exported for fullHistory.js's single-student aggregation, which needs
  // the same per-student building blocks listStudents already batches for
  // the whole roster — not meant for use outside this module otherwise.
  attachParents,
  attachAdmissionPayments,
  admissionStageFor,
};
