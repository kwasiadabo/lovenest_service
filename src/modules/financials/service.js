const { Op } = require('sequelize');
const {
  sequelize,
  Bill, BillItem, BillPayment, BillPaymentRevision, FeeType, FeeAmount, AcademicYear, Term, Student, StudentClassAssignment, Class, Level,
  StudentParent, Parent, School, User, CashAccount,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const assertNotSelfReversal = require('../../utils/assertNotSelfReversal');
const { notifyPaymentReceipt } = require('./notify');
const messagingService = require('../messaging/service');
const { postJournalEntry, reverseEntryFor } = require('../accounting/ledgerPoster');
const { FEE_CATEGORY_ACCOUNT_CODES } = require('../../utils/defaultChartOfAccounts');
const transportService = require('../transport/service');

// Every User include in this file must be scoped to this — full User rows
// carry passwordHash/resetPasswordTokenHash, which must never reach the API
// response.
const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

// A raw email address on a printed receipt reads unprofessional — this is
// the fallback only, not a real name; the onboarding flow doesn't currently
// collect the school admin's name (fullName is nullable), so this covers
// that gap until it does.
function displayName(user) {
  if (!user) return null;
  if (user.fullName?.trim()) return user.fullName.trim();
  if (!user.email) return null;
  return user.email.split('@')[0]
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// The receipt shows the student's current-year class alongside their name —
// looked up separately since BillPayment carries no class of its own
// (payments aren't tied to a specific bill/term, see the ledger note below).
async function getStudentClassLabel(schoolId, studentId) {
  const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  if (!currentYear) return null;

  const assignment = await tenantScoped(StudentClassAssignment, schoolId).findOne({
    where: { studentId, academicYearId: currentYear.id },
    include: [{ model: Class, include: [Level] }],
  });
  if (!assignment?.Class) return null;
  return assignment.Class.Level ? `${assignment.Class.name} (${assignment.Class.Level.name})` : assignment.Class.name;
}

// ---- Amount resolution ----
// Same precedence the admission wizard already applies client-side (class
// override beats level default), ported server-side and generalized with a
// termId dimension since regular billing (unlike admission) is always termly.

async function resolveAmount(schoolId, {
  academicYearId, termId, levelId, classId, feeTypeId,
}) {
  const candidates = await tenantScoped(FeeAmount, schoolId).findAll({
    where: {
      academicYearId, termId, levelId, feeTypeId,
    },
  });
  const classMatch = classId ? candidates.find((fa) => fa.classId === classId) : null;
  const levelDefault = candidates.find((fa) => !fa.classId);
  const match = classMatch || levelDefault;
  return match ? match.amountPesewas : undefined;
}

async function recomputeBillTotal(schoolId, billId) {
  const items = await tenantScoped(BillItem, schoolId).findAll({ where: { billId } });
  const totalPesewas = items.reduce((sum, item) => sum + item.amountPesewas, 0);
  await tenantScoped(Bill, schoolId).update({ totalPesewas }, { where: { id: billId } });
}

// Confirmed bills are the debits, BillPayments are the credits (see the
// ledger note below) — this is the same figure surfaced there, positive
// meaning the student owes money.
async function computeStudentBalancePesewas(schoolId, studentId) {
  const bills = await tenantScoped(Bill, schoolId).findAll({ where: { studentId, status: 'CONFIRMED' } });
  const payments = await tenantScoped(BillPayment, schoolId).findAll({ where: { studentId } });
  const totalBilledPesewas = bills.reduce((sum, b) => sum + b.totalPesewas, 0);
  const totalPaidPesewas = payments.reduce((sum, p) => sum + p.amountPesewas, 0);
  return totalBilledPesewas - totalPaidPesewas;
}

// ---- Sibling discount ----
// The 3rd active child in a family (students sharing a Parent record, either
// FATHER or MOTHER) gets thirdChildDiscountPercent off their TERM fees; the
// 4th and every later child gets fourthChildAndAboveDiscountPercent instead.
// "Child order" is by admissionDate (whoever enrolled first is the 1st
// child), not date of birth, and only ACTIVE students count — a withdrawn/
// graduated/transferred sibling neither counts toward nor benefits from it.

async function getFamilyStudentIds(schoolId, studentId) {
  const links = await tenantScoped(StudentParent, schoolId).findAll({ where: { studentId } });
  const parentIds = links.map((l) => l.parentId);
  if (parentIds.length === 0) return [studentId];

  const siblingLinks = await tenantScoped(StudentParent, schoolId).findAll({ where: { parentId: parentIds } });
  return [...new Set(siblingLinks.map((l) => l.studentId))];
}

async function resolveSiblingDiscountPercent(schoolId, school, studentId) {
  const thirdChildPercent = Number(school.thirdChildDiscountPercent);
  const fourthChildAndAbovePercent = Number(school.fourthChildAndAboveDiscountPercent);
  if (thirdChildPercent <= 0 && fourthChildAndAbovePercent <= 0) return 0;

  const familyStudentIds = await getFamilyStudentIds(schoolId, studentId);
  const activeSiblings = await tenantScoped(Student, schoolId).findAll({
    where: { id: familyStudentIds, status: 'ACTIVE' },
    order: [['admissionDate', 'ASC'], ['createdAt', 'ASC']],
  });

  const rank = activeSiblings.findIndex((s) => s.id === studentId) + 1;
  if (rank === 3) return thirdChildPercent;
  if (rank >= 4) return fourthChildAndAbovePercent;
  return 0;
}

// ---- Individual discount ----
// A concession set on one specific student (staff-child, hardship case,
// etc. — see Student.individualDiscountType), either a percentage or a flat
// cedis amount off their TERM fees. Overrides the sibling discount entirely
// for that student — the two never stack (see syncStudentDiscount below).

function resolveIndividualDiscountPesewas(termFeesPesewas, student) {
  if (student.individualDiscountType === 'PERCENT') {
    return Math.round(termFeesPesewas * (Number(student.individualDiscountPercent) / 100));
  }
  if (student.individualDiscountType === 'FLAT') {
    // Capped at the term fees themselves — a flat discount larger than what's
    // actually billed would otherwise push the bill negative.
    return Math.min(Number(student.individualDiscountFlatPesewas), termFeesPesewas);
  }
  return 0;
}

async function upsertDiscountItem(schoolId, billId, source, discountPesewas) {
  const existing = await tenantScoped(BillItem, schoolId).findOne({ where: { billId, source } });
  if (discountPesewas > 0) {
    if (existing) {
      existing.amountPesewas = -discountPesewas;
      await existing.save();
    } else {
      await tenantScoped(BillItem, schoolId).create({
        billId, feeTypeId: null, amountPesewas: -discountPesewas, source,
      });
    }
  } else if (existing) {
    await existing.destroy();
  }
}

// Recomputed fresh from the bill's current STANDARD/TERM items every time
// (not just the fee types touched in this generateBills call) so it stays
// correct across repeated/partial bill generation for the same term. A
// student's individual discount (if set) overrides their sibling discount —
// only one of the two discount line items is ever non-zero on a bill, so
// switching a student in or out of an individual discount cleans up
// whichever line no longer applies.
async function syncStudentDiscount(schoolId, school, bill, student) {
  const standardItems = await tenantScoped(BillItem, schoolId).findAll({
    where: { billId: bill.id, source: 'STANDARD' },
    include: [FeeType],
  });
  const termFeesPesewas = standardItems
    .filter((item) => item.FeeType?.category === 'TERM')
    .reduce((sum, item) => sum + item.amountPesewas, 0);

  const hasIndividualDiscount = !!student.individualDiscountType;
  const individualDiscountPesewas = hasIndividualDiscount
    ? resolveIndividualDiscountPesewas(termFeesPesewas, student)
    : 0;

  const siblingDiscountPercent = hasIndividualDiscount
    ? 0
    : await resolveSiblingDiscountPercent(schoolId, school, student.id);
  const siblingDiscountPesewas = siblingDiscountPercent > 0
    ? Math.round(termFeesPesewas * (siblingDiscountPercent / 100))
    : 0;

  await upsertDiscountItem(schoolId, bill.id, 'INDIVIDUAL_DISCOUNT', individualDiscountPesewas);
  await upsertDiscountItem(schoolId, bill.id, 'DISCOUNT', siblingDiscountPesewas);
}

// targetIds is always an array — Sequelize turns an array value into an
// IN (...) clause, so this naturally supports selecting several levels or
// classes at once, not just one.
async function resolveTargetAssignments(schoolId, { academicYearId, targetType, targetIds }) {
  const where = { academicYearId };
  if (targetType === 'CLASS') where.classId = targetIds;
  if (targetType === 'STUDENT') where.studentId = targetIds;

  const include = [
    { model: Student, where: { status: 'ACTIVE' } },
    targetType === 'LEVEL' ? { model: Class, where: { levelId: targetIds } } : { model: Class },
  ];

  return tenantScoped(StudentClassAssignment, schoolId).findAll({ where, include });
}

// ---- Bills ----

async function generateBills(schoolId, userId, {
  academicYearId, termId, targetType, targetIds, feeTypeIds,
}) {
  const year = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
  if (!year) throw new ApiError(404, 'Academic year not found');

  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');
  if (term.academicYearId !== academicYearId) {
    throw new ApiError(400, 'That term does not belong to the selected academic year');
  }

  const feeTypes = await tenantScoped(FeeType, schoolId).findAll({ where: { id: feeTypeIds } });
  if (feeTypes.length !== feeTypeIds.length) throw new ApiError(404, 'One or more fee items not found');
  if (feeTypes.some((ft) => ft.category === 'ADMISSION')) {
    throw new ApiError(400, 'Admission fees cannot be billed through this feature — use the Admission wizard instead');
  }

  const assignments = await resolveTargetAssignments(schoolId, { academicYearId, targetType, targetIds });
  const school = await School.findByPk(schoolId);

  let billsCreated = 0;
  let billsUpdated = 0;
  let billsSkipped = 0;
  let studentsWithNoAmount = 0;

  for (const assignment of assignments) {
    const { studentId, classId } = assignment;
    const levelId = assignment.Class.levelId;

    let bill = await tenantScoped(Bill, schoolId).findOne({ where: { studentId, termId } });
    if (bill && bill.status === 'CONFIRMED') {
      billsSkipped += 1;
      continue;
    }

    const isNewBill = !bill;
    if (!bill) {
      bill = await tenantScoped(Bill, schoolId).create({
        studentId, academicYearId, termId, status: 'PROVISIONAL', totalPesewas: 0,
      });
    }

    let anyAmount = false;
    for (const feeType of feeTypes) {
      const amountPesewas = await resolveAmount(schoolId, {
        academicYearId, termId, levelId, classId, feeTypeId: feeType.id,
      });
      if (amountPesewas === undefined) continue;
      anyAmount = true;

      const existingItem = await tenantScoped(BillItem, schoolId).findOne({
        where: { billId: bill.id, feeTypeId: feeType.id, source: 'STANDARD' },
      });
      if (existingItem) {
        existingItem.amountPesewas = amountPesewas;
        await existingItem.save();
      } else {
        await tenantScoped(BillItem, schoolId).create({
          billId: bill.id, feeTypeId: feeType.id, amountPesewas, source: 'STANDARD',
        });
      }
    }

    if (!anyAmount && isNewBill) {
      // Nothing to bill this student for — remove the empty bill just created.
      await tenantScoped(Bill, schoolId).destroy({ where: { id: bill.id } });
      studentsWithNoAmount += 1;
      continue;
    }

    await syncStudentDiscount(schoolId, school, bill, assignment.Student);

    // Carry forward any outstanding balance from prior confirmed bills as an
    // arrears line, so it's collected alongside this term's fees.
    const arrearsPesewas = Math.max(0, await computeStudentBalancePesewas(schoolId, studentId));
    const existingArrearsItem = await tenantScoped(BillItem, schoolId).findOne({
      where: { billId: bill.id, source: 'ARREARS' },
    });
    if (arrearsPesewas > 0) {
      if (existingArrearsItem) {
        existingArrearsItem.amountPesewas = arrearsPesewas;
        await existingArrearsItem.save();
      } else {
        await tenantScoped(BillItem, schoolId).create({
          billId: bill.id, feeTypeId: null, amountPesewas: arrearsPesewas, source: 'ARREARS',
        });
      }
    } else if (existingArrearsItem) {
      await existingArrearsItem.destroy();
    }

    await recomputeBillTotal(schoolId, bill.id);
    if (isNewBill) billsCreated += 1;
    else billsUpdated += 1;
  }

  // Bundled rather than a separate step: generating this term's tuition
  // bills also generates this term's termly transport invoices, for every
  // TERMLY subscriber school-wide — not just the target scope of this bill
  // run, since transport subscription is independent of who's being billed
  // tuition right now. Safe to run on every call regardless of scope because
  // generateTransportInvoices is idempotent (skips periods already
  // invoiced), and never allowed to fail the tuition bill run that already
  // succeeded — same best-effort-sibling-operation shape as a notification
  // send elsewhere in this file.
  let transport = null;
  try {
    transport = await transportService.generateTransportInvoices(schoolId, userId, { billingCycle: 'TERMLY', termId });
  } catch (err) {
    transport = { error: err.message };
  }

  return {
    billsCreated, billsUpdated, billsSkipped, studentsWithNoAmount, transport,
  };
}

async function listBills(schoolId, {
  academicYearId, termId, status, levelId, classId, studentId,
} = {}) {
  const where = {};
  if (academicYearId) where.academicYearId = academicYearId;
  if (termId) where.termId = termId;
  if (status) where.status = status;
  if (studentId) where.studentId = studentId;

  let bills = await tenantScoped(Bill, schoolId).findAll({
    where,
    include: [Student, Term, AcademicYear, { model: BillItem, as: 'items', include: [FeeType] }],
    order: [['createdAt', 'DESC']],
  });

  // Attach each bill's current class/level (for display + the level/class
  // filter below) — Bill has no denormalized class/level of its own, so this
  // is looked up via the student's class assignment for the bill's year.
  if (academicYearId) {
    const assignments = await tenantScoped(StudentClassAssignment, schoolId).findAll({
      where: { academicYearId, ...(classId ? { classId } : {}) },
      include: [levelId ? { model: Class, where: { levelId }, include: [Level] } : { model: Class, include: [Level] }],
    });
    const assignmentByStudentId = new Map(assignments.map((a) => [a.studentId, a]));

    bills = bills
      .map((bill) => {
        const assignment = assignmentByStudentId.get(bill.studentId);
        return {
          ...bill.toJSON(),
          classInfo: assignment ? {
            classId: assignment.Class.id,
            className: assignment.Class.name,
            levelId: assignment.Class.levelId,
            levelName: assignment.Class.Level?.name,
          } : null,
        };
      });

    if (levelId || classId) {
      const allowedStudentIds = new Set(assignments.map((a) => a.studentId));
      bills = bills.filter((b) => allowedStudentIds.has(b.studentId));
    }
  }

  return bills;
}

async function addSpecialItem(schoolId, billId, { feeTypeId, amountPesewas }) {
  const bill = await tenantScoped(Bill, schoolId).findByPk(billId);
  if (!bill) throw new ApiError(404, 'Bill not found');
  if (bill.status !== 'PROVISIONAL') throw new ApiError(400, 'Only a provisional bill can be edited');

  const feeType = await tenantScoped(FeeType, schoolId).findByPk(feeTypeId);
  if (!feeType) throw new ApiError(404, 'Fee type not found');

  const item = await tenantScoped(BillItem, schoolId).create({
    billId, feeTypeId, amountPesewas, source: 'SPECIAL',
  });
  await recomputeBillTotal(schoolId, billId);
  return item;
}

async function removeBillItem(schoolId, billItemId) {
  const item = await tenantScoped(BillItem, schoolId).findByPk(billItemId);
  if (!item) throw new ApiError(404, 'Bill item not found');

  const bill = await tenantScoped(Bill, schoolId).findByPk(item.billId);
  if (bill && bill.status !== 'PROVISIONAL') throw new ApiError(400, 'Only a provisional bill can be edited');

  await tenantScoped(BillItem, schoolId).destroy({ where: { id: billItemId } });
  await recomputeBillTotal(schoolId, item.billId);
}

// Recognizes AR/income for a confirmed bill's non-arrears items only.
// ARREARS items carry forward a balance already recognized as AR/income
// when the *prior* bill was confirmed — including them here would
// double-count both the AR balance and the income.
async function postBillConfirmation(schoolId, bill, userId, transaction) {
  const items = await tenantScoped(BillItem, schoolId).findAll({
    where: { billId: bill.id, source: { [Op.ne]: 'ARREARS' } },
    include: [FeeType],
    transaction,
  });
  if (items.length === 0) return;

  const positiveItems = items.filter((item) => item.amountPesewas > 0);
  const discountItems = items.filter((item) => item.amountPesewas < 0);
  const arNetPesewas = items.reduce((sum, item) => sum + item.amountPesewas, 0);
  const discountsAbsPesewas = discountItems.reduce((sum, item) => sum - item.amountPesewas, 0);

  if (arNetPesewas <= 0 && discountsAbsPesewas === 0) return;

  const incomeByCategory = {};
  positiveItems.forEach((item) => {
    const category = item.FeeType ? item.FeeType.category : 'OTHER';
    incomeByCategory[category] = (incomeByCategory[category] || 0) + item.amountPesewas;
  });

  const lines = [
    { accountCode: '1100', debitPesewas: arNetPesewas, studentId: bill.studentId },
  ];
  if (discountsAbsPesewas > 0) {
    lines.push({ accountCode: '4090', debitPesewas: discountsAbsPesewas, studentId: bill.studentId });
  }
  Object.entries(incomeByCategory).forEach(([category, amountPesewas]) => {
    lines.push({
      accountCode: FEE_CATEGORY_ACCOUNT_CODES[category] || FEE_CATEGORY_ACCOUNT_CODES.OTHER,
      creditPesewas: amountPesewas,
      studentId: bill.studentId,
    });
  });

  await postJournalEntry(schoolId, {
    entryDate: bill.confirmedAt.toISOString().slice(0, 10),
    description: `Bill confirmed for student`,
    sourceType: 'BILL_CONFIRMATION',
    sourceId: bill.id,
    userId,
    lines,
  }, transaction);
}

async function confirmBill(schoolId, billId, userId) {
  return sequelize.transaction(async (transaction) => {
    const bill = await tenantScoped(Bill, schoolId).findByPk(billId, { transaction });
    if (!bill) throw new ApiError(404, 'Bill not found');
    if (bill.status === 'CONFIRMED') return { bill, alreadyConfirmed: true };

    bill.status = 'CONFIRMED';
    bill.confirmedByUserId = userId;
    bill.confirmedAt = new Date();
    await bill.save({ transaction });

    await postBillConfirmation(schoolId, bill, userId, transaction);

    return { bill, alreadyConfirmed: false };
  });
}

async function confirmBills(schoolId, billIds, userId) {
  const confirmed = [];
  const alreadyConfirmed = [];
  for (const billId of billIds) {
    const result = await confirmBill(schoolId, billId, userId);
    (result.alreadyConfirmed ? alreadyConfirmed : confirmed).push(result.bill.id);
  }
  return { confirmed, alreadyConfirmed };
}

// ---- Student ledger ----
// A "ledger" is a computed view, not its own table: confirmed bills are the
// debits, BillPayments are the credits. Payments aren't allocated to any
// specific bill — they just reduce the student's overall balance, matching
// how a lump-sum fee payment actually works.

async function getStudentLedger(schoolId, studentId) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const bills = await tenantScoped(Bill, schoolId).findAll({
    where: { studentId, status: 'CONFIRMED' },
    include: [Term, { model: BillItem, as: 'items', include: [FeeType] }],
    order: [['confirmedAt', 'DESC']],
  });
  const payments = await tenantScoped(BillPayment, schoolId).findAll({
    where: { studentId },
    order: [['paidDate', 'DESC']],
  });

  return { bills, payments, balancePesewas: await computeStudentBalancePesewas(schoolId, studentId) };
}

// A statement is the ledger narrowed to a date range, plus a balance brought
// forward — without it the range's closing balance wouldn't reconcile with
// the student's actual balance whenever they had history before `from`.
// Bills are scoped by confirmedAt (when they were posted), payments by
// paidDate, same fields listBills/listPayments already key off of.
async function getStudentFinancialStatement(schoolId, studentId, { from, to } = {}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const billWhere = { studentId, status: 'CONFIRMED' };
  if (from && to) billWhere.confirmedAt = { [Op.between]: [`${from} 00:00:00`, `${to} 23:59:59`] };
  else if (from) billWhere.confirmedAt = { [Op.gte]: `${from} 00:00:00` };
  else if (to) billWhere.confirmedAt = { [Op.lte]: `${to} 23:59:59` };

  const paymentWhere = { studentId };
  if (from && to) paymentWhere.paidDate = { [Op.between]: [from, to] };
  else if (from) paymentWhere.paidDate = { [Op.gte]: from };
  else if (to) paymentWhere.paidDate = { [Op.lte]: to };

  const bills = await tenantScoped(Bill, schoolId).findAll({
    where: billWhere,
    include: [Term, { model: BillItem, as: 'items', include: [FeeType] }],
    order: [['confirmedAt', 'ASC']],
  });
  const payments = await tenantScoped(BillPayment, schoolId).findAll({
    where: paymentWhere,
    order: [['paidDate', 'ASC']],
  });

  let openingBalancePesewas = 0;
  if (from) {
    const priorBills = await tenantScoped(Bill, schoolId).findAll({
      where: { studentId, status: 'CONFIRMED', confirmedAt: { [Op.lt]: `${from} 00:00:00` } },
    });
    const priorPayments = await tenantScoped(BillPayment, schoolId).findAll({
      where: { studentId, paidDate: { [Op.lt]: from } },
    });
    openingBalancePesewas = priorBills.reduce((sum, b) => sum + b.totalPesewas, 0)
      - priorPayments.reduce((sum, p) => sum + p.amountPesewas, 0);
  }

  const totalBilledPesewas = bills.reduce((sum, b) => sum + b.totalPesewas, 0);
  const totalPaidPesewas = payments.reduce((sum, p) => sum + p.amountPesewas, 0);
  const classLabel = await getStudentClassLabel(schoolId, studentId);

  return {
    student: { ...student.toJSON(), classLabel },
    bills,
    payments,
    openingBalancePesewas,
    totalBilledPesewas,
    totalPaidPesewas,
    closingBalancePesewas: openingBalancePesewas + totalBilledPesewas - totalPaidPesewas,
  };
}

// Sequential per school, "RCT-000001" style, derived from the highest
// existing suffix rather than a row count — a count-based scheme silently
// desyncs (and then permanently collides on every future create) the moment
// any receiptNumber doesn't match "row count so far", e.g. after a deletion.
// Race-prone under concurrent payments for the same school (not a DB
// sequence) — retried once on a unique-constraint collision, which is enough
// for this app's single-cashier-at-a-time scale.
// A SQL MAX() aggregate rather than pulling every receiptNumber ever issued
// for the school into Node — bill_payments has a unique (schoolId,
// receiptNumber) index, so this stays an indexed lookup no matter how many
// payments the school has recorded, instead of growing slower with every
// receipt ever printed (same fix as ledgerPoster.js#generateEntryNumber).
async function generateReceiptNumber(schoolId) {
  // findAll (not findOne) deliberately — findOne implies limit: 1, and
  // Sequelize's mssql query generator force-adds "ORDER BY [id]" to any
  // limited query when no order is given (even order: [] — it checks
  // order.length === 0 and treats that the same as "no order"), which SQL
  // Server rejects on a bare aggregate with no GROUP BY. A MAX() with no
  // GROUP BY always collapses to exactly one row anyway, so no limit is
  // needed at all — this sidesteps the forced-ORDER-BY path entirely.
  const [result] = await tenantScoped(BillPayment, schoolId).findAll({
    attributes: [[sequelize.fn('MAX', sequelize.col('receiptNumber')), 'maxReceiptNumber']],
    raw: true,
  });
  const match = /^RCT-(\d+)$/.exec(result?.maxReceiptNumber || '');
  const maxNumber = match ? Number(match[1]) : 0;
  return `RCT-${String(maxNumber + 1).padStart(6, '0')}`;
}

async function createBillPaymentWithReceipt(schoolId, values, transaction) {
  try {
    const receiptNumber = await generateReceiptNumber(schoolId);
    return await tenantScoped(BillPayment, schoolId).create({ ...values, receiptNumber }, { transaction });
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    const receiptNumber = await generateReceiptNumber(schoolId);
    return tenantScoped(BillPayment, schoolId).create({ ...values, receiptNumber }, { transaction });
  }
}

async function postBillPayment(schoolId, payment, userId, transaction) {
  const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(payment.cashAccountId, { transaction });
  if (!cashAccount) throw new ApiError(400, 'cashAccountId does not refer to a valid cash account');

  await postJournalEntry(schoolId, {
    entryDate: payment.paidDate,
    description: `Fee payment received (receipt ${payment.receiptNumber})`,
    sourceType: 'BILL_PAYMENT',
    sourceId: payment.id,
    userId,
    lines: [
      { accountId: cashAccount.accountId, debitPesewas: payment.amountPesewas, studentId: payment.studentId },
      { accountCode: '1100', creditPesewas: payment.amountPesewas, studentId: payment.studentId },
    ],
  }, transaction);
}

async function recordPayment(schoolId, studentId, userId, {
  amountPesewas, method, paidDate, reference, notes, cashAccountId,
}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const payment = await sequelize.transaction(async (transaction) => {
    const created = await createBillPaymentWithReceipt(schoolId, {
      studentId,
      amountPesewas,
      method,
      paidDate,
      reference: reference || null,
      notes: notes || null,
      recordedByUserId: userId,
      cashAccountId,
    }, transaction);
    await postBillPayment(schoolId, created, userId, transaction);
    return created;
  });

  const balancePesewas = await computeStudentBalancePesewas(schoolId, studentId);

  // Notifications are best-effort — never let a bad phone number or a mail
  // provider hiccup fail (or roll back) a payment that's already recorded.
  let notifications = { sms: { attempted: 0, sent: 0, failed: 0 }, email: { attempted: 0, sent: 0, failed: 0 } };
  try {
    const [school, issuer, classLabel] = await Promise.all([
      School.findByPk(schoolId),
      userId ? User.findByPk(userId) : null,
      getStudentClassLabel(schoolId, studentId),
    ]);
    notifications = await notifyPaymentReceipt(schoolId, {
      school,
      student: { ...student.toJSON(), classLabel },
      payment,
      balancePesewas,
      issuedByName: displayName(issuer),
    });
  } catch (err) {
    notifications.error = err.message;
  }

  return { payment, balancePesewas, notifications };
}

async function deletePayment(schoolId, billPaymentId, userId) {
  return sequelize.transaction(async (transaction) => {
    const payment = await tenantScoped(BillPayment, schoolId).findByPk(billPaymentId, { transaction });
    if (!payment) throw new ApiError(404, 'Payment not found');
    assertNotSelfReversal(payment.recordedByUserId, userId);

    await reverseEntryFor(schoolId, 'BILL_PAYMENT', payment.id, { userId, reason: 'Payment deleted' }, transaction);
    await payment.destroy({ transaction });
  });
}

// Single source of truth for the receipt PDF endpoint — loads everything
// notifyPaymentReceipt already needed at payment time, so the on-demand
// re-download always matches what was emailed.
async function getReceiptData(schoolId, billPaymentId) {
  const payment = await tenantScoped(BillPayment, schoolId).findByPk(billPaymentId, {
    include: [
      { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'lastEditedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
  });
  if (!payment) throw new ApiError(404, 'Payment not found');

  const student = await tenantScoped(Student, schoolId).findByPk(payment.studentId);
  const school = await School.findByPk(schoolId);
  const balancePesewas = await computeStudentBalancePesewas(schoolId, payment.studentId);
  const classLabel = await getStudentClassLabel(schoolId, payment.studentId);

  // A corrected receipt is "issued by" whoever made the correction, not the
  // (possibly different) person who recorded the original payment.
  const issuer = payment.lastEditedBy || payment.recordedBy;

  return {
    school,
    student: { ...student.toJSON(), classLabel },
    payment,
    balancePesewas,
    issuedByName: displayName(issuer),
  };
}

// ---- Payment list (day/period view) ----

async function listPayments(schoolId, {
  from, to, levelId, classId,
} = {}) {
  const where = {};
  if (from && to) where.paidDate = { [Op.between]: [from, to] };
  else if (from) where.paidDate = { [Op.gte]: from };
  else if (to) where.paidDate = { [Op.lte]: to };

  let payments = await tenantScoped(BillPayment, schoolId).findAll({
    where,
    include: [
      Student,
      { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'lastEditedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
    order: [['paidDate', 'DESC'], ['createdAt', 'DESC']],
  });

  // Payments aren't tied to a class themselves — each is matched against the
  // paying student's *current-year* class assignment (same convention as
  // the receipt's classLabel), not whatever class they were in when paid.
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

  const paymentIds = payments.map((p) => p.id);
  const revisionCounts = paymentIds.length > 0
    ? await tenantScoped(BillPaymentRevision, schoolId).findAll({
      where: { billPaymentId: paymentIds },
      attributes: ['billPaymentId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['billPaymentId'],
    })
    : [];
  const countByPaymentId = new Map(revisionCounts.map((r) => [r.billPaymentId, Number(r.get('count'))]));

  const totalPesewas = payments.reduce((sum, p) => sum + p.amountPesewas, 0);

  return {
    payments: payments.map((p) => ({ ...p, revisionCount: countByPaymentId.get(p.id) || 0 })),
    totalPesewas,
  };
}

// Amount/method/date/reference/notes are all editable after the fact (a
// cashier typo, a wrong mode of payment, etc.) — gated on a mandatory,
// substantive `reason` (enforced by validatePaymentUpdate) so every change
// is self-explaining, and audited via a BillPaymentRevision row rather than
// silently overwriting history. The receipt keeps its original number —
// only its contents change — so parents/records referencing that number
// still point at the (now-corrected) same receipt.
async function updateBillPayment(schoolId, billPaymentId, userId, {
  amountPesewas, method, paidDate, reference, notes, reason, cashAccountId,
}) {
  await sequelize.transaction(async (transaction) => {
    const payment = await tenantScoped(BillPayment, schoolId).findByPk(billPaymentId, { transaction });
    if (!payment) throw new ApiError(404, 'Payment not found');

    const previousValues = {
      amountPesewas: payment.amountPesewas,
      method: payment.method,
      paidDate: payment.paidDate,
      reference: payment.reference,
      notes: payment.notes,
    };

    await reverseEntryFor(schoolId, 'BILL_PAYMENT', payment.id, { userId, reason }, transaction);

    payment.amountPesewas = amountPesewas;
    payment.method = method;
    payment.paidDate = paidDate;
    payment.reference = reference || null;
    payment.notes = notes || null;
    payment.cashAccountId = cashAccountId;
    payment.lastEditedByUserId = userId;
    await payment.save({ transaction });

    await postBillPayment(schoolId, payment, userId, transaction);

    await tenantScoped(BillPaymentRevision, schoolId).create({
      billPaymentId: payment.id,
      changedByUserId: userId,
      reason,
      previousValues: JSON.stringify(previousValues),
      newValues: JSON.stringify({
        amountPesewas, method, paidDate, reference: reference || null, notes: notes || null,
      }),
    }, { transaction });
  });

  const payment = await tenantScoped(BillPayment, schoolId).findByPk(billPaymentId);
  const student = await tenantScoped(Student, schoolId).findByPk(payment.studentId);
  const balancePesewas = await computeStudentBalancePesewas(schoolId, payment.studentId);

  let notifications = { sms: { attempted: 0, sent: 0, failed: 0 }, email: { attempted: 0, sent: 0, failed: 0 } };
  try {
    const [school, editor, classLabel] = await Promise.all([
      School.findByPk(schoolId),
      User.findByPk(userId),
      getStudentClassLabel(schoolId, payment.studentId),
    ]);
    notifications = await notifyPaymentReceipt(schoolId, {
      school,
      student: { ...student.toJSON(), classLabel },
      payment,
      balancePesewas,
      issuedByName: displayName(editor),
    });
  } catch (err) {
    notifications.error = err.message;
  }

  return { payment, balancePesewas, notifications };
}

async function getPaymentRevisions(schoolId, billPaymentId) {
  const payment = await tenantScoped(BillPayment, schoolId).findByPk(billPaymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');

  const revisions = await tenantScoped(BillPaymentRevision, schoolId).findAll({
    where: { billPaymentId },
    include: [{ model: User, as: 'changedBy', attributes: USER_SUMMARY_ATTRIBUTES }],
    order: [['createdAt', 'DESC']],
  });

  return revisions.map((r) => ({
    id: r.id,
    reason: r.reason,
    changedAt: r.createdAt,
    changedByName: r.changedBy?.fullName || r.changedBy?.email,
    previousValues: JSON.parse(r.previousValues),
    newValues: JSON.parse(r.newValues),
  }));
}

// ---- Payment analytics ----
// Scoped to a from/to date range for the trend/breakdown figures; the
// collection-rate gauge is deliberately all-time and unscoped by the range,
// same reasoning as Bill analytics' schoolWide block — an honest cash
// position, not something a date filter should be able to distort.

const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash', MOBILE_MONEY: 'Mobile money', BANK_TRANSFER: 'Bank transfer', OTHER: 'Other',
};
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function getPaymentAnalytics(schoolId, { from, to }) {
  if (!from || !to) throw new ApiError(400, 'from and to are required');

  const payments = await tenantScoped(BillPayment, schoolId).findAll({
    where: { paidDate: { [Op.between]: [from, to] } },
    order: [['paidDate', 'ASC']],
  });

  // Same current-year class resolution as listPayments — a payment is
  // matched against the paying student's *current* class, not whatever
  // class they were in on the day they paid.
  const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  const assignments = currentYear && payments.length > 0
    ? await tenantScoped(StudentClassAssignment, schoolId).findAll({
      where: { academicYearId: currentYear.id, studentId: payments.map((p) => p.studentId) },
      include: [{ model: Class, include: [Level] }],
    })
    : [];
  const assignmentByStudentId = new Map(assignments.map((a) => [a.studentId, a]));

  let totalPesewas = 0;
  const uniqueStudentIds = new Set();
  const byMethodMap = new Map();
  const byLevelMap = new Map();
  const byClassMap = new Map();
  const byWeekdayCount = new Array(7).fill(0);
  const byWeekdayPesewas = new Array(7).fill(0);
  const byDateMap = new Map();

  for (const payment of payments) {
    totalPesewas += payment.amountPesewas;
    uniqueStudentIds.add(payment.studentId);

    const methodEntry = byMethodMap.get(payment.method) || { method: payment.method, count: 0, totalPesewas: 0 };
    methodEntry.count += 1;
    methodEntry.totalPesewas += payment.amountPesewas;
    byMethodMap.set(payment.method, methodEntry);

    const assignment = assignmentByStudentId.get(payment.studentId);
    const levelKey = assignment?.Class?.levelId || 'none';
    const levelEntry = byLevelMap.get(levelKey) || {
      levelId: levelKey, name: assignment?.Class?.Level?.name || 'No level', count: 0, totalPesewas: 0,
    };
    levelEntry.count += 1;
    levelEntry.totalPesewas += payment.amountPesewas;
    byLevelMap.set(levelKey, levelEntry);

    const classKey = assignment?.Class?.id || 'none';
    const classEntry = byClassMap.get(classKey) || {
      classId: classKey, name: assignment?.Class?.name || 'No class', levelName: assignment?.Class?.Level?.name || null, count: 0, totalPesewas: 0,
    };
    classEntry.count += 1;
    classEntry.totalPesewas += payment.amountPesewas;
    byClassMap.set(classKey, classEntry);

    // paidDate is DATEONLY ("YYYY-MM-DD") — parsed as UTC midnight, so
    // getUTCDay() (not getDay()) avoids an off-by-one in timezones behind UTC.
    const weekday = new Date(payment.paidDate).getUTCDay();
    byWeekdayCount[weekday] += 1;
    byWeekdayPesewas[weekday] += payment.amountPesewas;

    const dateEntry = byDateMap.get(payment.paidDate) || { date: payment.paidDate, count: 0, totalPesewas: 0 };
    dateEntry.count += 1;
    dateEntry.totalPesewas += payment.amountPesewas;
    byDateMap.set(payment.paidDate, dateEntry);
  }

  const byMethod = [...byMethodMap.values()]
    .map((m) => ({ ...m, label: PAYMENT_METHOD_LABELS[m.method] || m.method }))
    .sort((a, b) => b.totalPesewas - a.totalPesewas);
  const byLevel = [...byLevelMap.values()].sort((a, b) => b.totalPesewas - a.totalPesewas);
  const byClass = [...byClassMap.values()].sort((a, b) => b.totalPesewas - a.totalPesewas);
  const byWeekday = WEEKDAY_NAMES.map((name, i) => ({
    weekday: name, count: byWeekdayCount[i], totalPesewas: byWeekdayPesewas[i],
  }));

  const sortedDates = [...byDateMap.keys()].sort();
  let cumulativePesewas = 0;
  const trend = sortedDates.map((date) => {
    const entry = byDateMap.get(date);
    cumulativePesewas += entry.totalPesewas;
    return {
      date, count: entry.count, totalPesewas: entry.totalPesewas, cumulativePesewas,
    };
  });

  const allConfirmedBills = await tenantScoped(Bill, schoolId).findAll({ where: { status: 'CONFIRMED' } });
  const allPayments = await tenantScoped(BillPayment, schoolId).findAll();
  const allTimeBilledPesewas = allConfirmedBills.reduce((sum, b) => sum + b.totalPesewas, 0);
  const allTimePaidPesewas = allPayments.reduce((sum, p) => sum + p.amountPesewas, 0);

  return {
    scope: { from, to },
    summary: {
      totalPayments: payments.length,
      totalPesewas,
      averagePesewas: payments.length > 0 ? Math.round(totalPesewas / payments.length) : 0,
      uniqueStudents: uniqueStudentIds.size,
    },
    byMethod,
    byLevel,
    byClass,
    byWeekday,
    trend,
    collection: {
      allTimeBilledPesewas,
      allTimePaidPesewas,
      outstandingPesewas: allTimeBilledPesewas - allTimePaidPesewas,
      collectionRatePercent: allTimeBilledPesewas > 0 ? Math.round((allTimePaidPesewas / allTimeBilledPesewas) * 100) : 0,
    },
  };
}

// ---- Bill analytics ----
// Everything here is scoped to one academic year + term, except `schoolWide`
// which is deliberately all-time — BillPayments aren't tied to a term (see
// the ledger note above), so a term-scoped "collected" figure would be
// fiction. schoolWide is the honest substitute: overall cash position.

async function getBillAnalytics(schoolId, { academicYearId, termId }) {
  if (!academicYearId || !termId) throw new ApiError(400, 'academicYearId and termId are required');

  const term = await tenantScoped(Term, schoolId).findByPk(termId);
  if (!term) throw new ApiError(404, 'Term not found');

  const bills = await listBills(schoolId, { academicYearId, termId });
  const totalStudents = await tenantScoped(Student, schoolId).count({ where: { status: 'ACTIVE' } });

  const billedStudentIds = new Set(bills.map((b) => b.studentId));

  let totalBilledPesewas = 0;
  let provisionalPesewas = 0;
  let confirmedPesewas = 0;
  let provisionalCount = 0;
  let confirmedCount = 0;
  let totalArrearsPesewas = 0;
  let totalDiscountPesewas = 0;
  const studentsWithArrears = new Set();

  const feeTypeMap = new Map();
  const levelMap = new Map();
  const classMap = new Map();
  const arrearsStudents = [];
  const confirmedByDate = new Map();

  for (const bill of bills) {
    totalBilledPesewas += bill.totalPesewas;
    if (bill.status === 'CONFIRMED') {
      confirmedPesewas += bill.totalPesewas;
      confirmedCount += 1;
      if (bill.confirmedAt) {
        const day = new Date(bill.confirmedAt).toISOString().slice(0, 10);
        const entry = confirmedByDate.get(day) || { count: 0, totalPesewas: 0 };
        entry.count += 1;
        entry.totalPesewas += bill.totalPesewas;
        confirmedByDate.set(day, entry);
      }
    } else {
      provisionalPesewas += bill.totalPesewas;
      provisionalCount += 1;
    }

    let billArrearsPesewas = 0;
    for (const item of bill.items) {
      if (item.source === 'ARREARS') {
        billArrearsPesewas += item.amountPesewas;
        continue;
      }
      if (item.source === 'DISCOUNT' || item.source === 'INDIVIDUAL_DISCOUNT') {
        totalDiscountPesewas += item.amountPesewas;
        continue;
      }
      const feeTypeId = item.feeTypeId || 'other';
      const feeTypeName = item.FeeType?.name || 'Other';
      const entry = feeTypeMap.get(feeTypeId) || {
        feeTypeId, name: feeTypeName, totalPesewas: 0, count: 0,
      };
      entry.totalPesewas += item.amountPesewas;
      entry.count += 1;
      feeTypeMap.set(feeTypeId, entry);
    }

    if (billArrearsPesewas > 0) {
      totalArrearsPesewas += billArrearsPesewas;
      studentsWithArrears.add(bill.studentId);
      arrearsStudents.push({
        studentId: bill.studentId,
        studentName: bill.Student?.fullName,
        studentNumber: bill.Student?.studentNumber,
        classLabel: bill.classInfo
          ? [bill.classInfo.levelName, bill.classInfo.className].filter(Boolean).join(' — ')
          : null,
        arrearsPesewas: billArrearsPesewas,
      });
    }

    const levelKey = bill.classInfo?.levelId || 'none';
    const levelEntry = levelMap.get(levelKey) || {
      levelId: levelKey,
      name: bill.classInfo?.levelName || 'No level',
      totalPesewas: 0,
      count: 0,
      confirmedPesewas: 0,
      provisionalPesewas: 0,
      studentIds: new Set(),
    };
    levelEntry.totalPesewas += bill.totalPesewas;
    levelEntry.count += 1;
    levelEntry.studentIds.add(bill.studentId);
    if (bill.status === 'CONFIRMED') levelEntry.confirmedPesewas += bill.totalPesewas;
    else levelEntry.provisionalPesewas += bill.totalPesewas;
    levelMap.set(levelKey, levelEntry);

    const classKey = bill.classInfo?.classId || 'none';
    const classEntry = classMap.get(classKey) || {
      classId: classKey,
      name: bill.classInfo?.className || 'No class',
      levelName: bill.classInfo?.levelName || null,
      totalPesewas: 0,
      count: 0,
      confirmedCount: 0,
      provisionalCount: 0,
      confirmedPesewas: 0,
      provisionalPesewas: 0,
      arrearsPesewas: 0,
    };
    classEntry.totalPesewas += bill.totalPesewas;
    classEntry.count += 1;
    if (bill.status === 'CONFIRMED') {
      classEntry.confirmedCount += 1;
      classEntry.confirmedPesewas += bill.totalPesewas;
    } else {
      classEntry.provisionalCount += 1;
      classEntry.provisionalPesewas += bill.totalPesewas;
    }
    classEntry.arrearsPesewas += billArrearsPesewas;
    classMap.set(classKey, classEntry);
  }

  const byFeeType = [...feeTypeMap.values()].sort((a, b) => b.totalPesewas - a.totalPesewas);
  const byLevel = [...levelMap.values()]
    .map((l) => ({ ...l, studentCount: l.studentIds.size, studentIds: undefined }))
    .sort((a, b) => b.totalPesewas - a.totalPesewas);
  const byClass = [...classMap.values()]
    .map((c) => ({ ...c, avgPesewas: c.count > 0 ? Math.round(c.totalPesewas / c.count) : 0 }))
    .sort((a, b) => b.totalPesewas - a.totalPesewas);
  const arrearsTopStudents = arrearsStudents
    .sort((a, b) => b.arrearsPesewas - a.arrearsPesewas)
    .slice(0, 10);

  const sortedDays = [...confirmedByDate.keys()].sort();
  let cumulativePesewas = 0;
  const confirmationTrend = sortedDays.map((day) => {
    const entry = confirmedByDate.get(day);
    cumulativePesewas += entry.totalPesewas;
    return {
      date: day, count: entry.count, totalPesewas: entry.totalPesewas, cumulativePesewas,
    };
  });

  const amounts = bills.map((b) => b.totalPesewas).filter((n) => n > 0);
  let amountDistribution = [];
  if (amounts.length > 0) {
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const bucketCount = Math.min(6, new Set(amounts).size) || 1;
    const bucketSize = Math.max(1, Math.ceil((max - min + 1) / bucketCount));
    const counts = new Array(bucketCount).fill(0);
    for (const amount of amounts) {
      const index = Math.min(bucketCount - 1, Math.floor((amount - min) / bucketSize));
      counts[index] += 1;
    }
    amountDistribution = counts.map((count, i) => ({
      rangeStartPesewas: min + i * bucketSize,
      rangeEndPesewas: min + (i + 1) * bucketSize - 1,
      count,
    }));
  }

  const allConfirmedBills = await tenantScoped(Bill, schoolId).findAll({ where: { status: 'CONFIRMED' } });
  const allPayments = await tenantScoped(BillPayment, schoolId).findAll();
  const allTimeBilledPesewas = allConfirmedBills.reduce((sum, b) => sum + b.totalPesewas, 0);
  const allTimePaidPesewas = allPayments.reduce((sum, p) => sum + p.amountPesewas, 0);

  return {
    scope: { academicYearId, termId, termName: term.name },
    summary: {
      totalStudents,
      billedStudents: billedStudentIds.size,
      unbilledStudents: Math.max(0, totalStudents - billedStudentIds.size),
      totalBills: bills.length,
      provisionalCount,
      confirmedCount,
      totalBilledPesewas,
      provisionalPesewas,
      confirmedPesewas,
      totalArrearsPesewas,
      studentsWithArrearsCount: studentsWithArrears.size,
      totalDiscountPesewas,
    },
    schoolWide: {
      allTimeBilledPesewas,
      allTimePaidPesewas,
      outstandingBalancePesewas: allTimeBilledPesewas - allTimePaidPesewas,
    },
    byFeeType,
    byLevel,
    byClass,
    arrearsTopStudents,
    confirmationTrend,
    amountDistribution,
  };
}

// ---- Debtors ----
// A school-wide, live view of every student who currently owes money —
// distinct from getBillAnalytics' arrearsTopStudents above, which is capped
// at 10 and only reflects the ARREARS bill-item carried into ONE term's
// bill, not a student's actual overall balance. Computed via two grouped
// SUM queries (not a per-student loop over computeStudentBalancePesewas) so
// this stays O(1) queries regardless of how many students the school has.

function formatAmountGHS(amountPesewas) {
  return `GHS ${(amountPesewas / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function getDebtors(schoolId, { levelId, classId } = {}) {
  const billedRows = await tenantScoped(Bill, schoolId).findAll({
    where: { status: 'CONFIRMED' },
    attributes: ['studentId', [sequelize.fn('SUM', sequelize.col('totalPesewas')), 'total']],
    group: ['studentId'],
  });
  const paidRows = await tenantScoped(BillPayment, schoolId).findAll({
    attributes: ['studentId', [sequelize.fn('SUM', sequelize.col('amountPesewas')), 'total']],
    group: ['studentId'],
  });

  const paidByStudent = new Map(paidRows.map((r) => [r.studentId, Number(r.get('total'))]));

  const debtorIds = [];
  const billedByStudent = new Map();
  const balanceByStudent = new Map();
  for (const row of billedRows) {
    const billedPesewas = Number(row.get('total'));
    const balancePesewas = billedPesewas - (paidByStudent.get(row.studentId) || 0);
    if (balancePesewas > 0) {
      debtorIds.push(row.studentId);
      billedByStudent.set(row.studentId, billedPesewas);
      balanceByStudent.set(row.studentId, balancePesewas);
    }
  }

  if (debtorIds.length === 0) return { debtors: [], totalOutstandingPesewas: 0 };

  const students = await tenantScoped(Student, schoolId).findAll({ where: { id: debtorIds } });

  const currentYear = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  const assignments = currentYear
    ? await tenantScoped(StudentClassAssignment, schoolId).findAll({
      where: { academicYearId: currentYear.id, studentId: debtorIds },
      include: [{ model: Class, include: [Level] }],
    })
    : [];
  const assignmentByStudentId = new Map(assignments.map((a) => [a.studentId, a]));

  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId: debtorIds },
    include: [Parent],
  });
  const parentsByStudentId = new Map();
  for (const link of links) {
    const list = parentsByStudentId.get(link.studentId) || [];
    list.push(link.Parent);
    parentsByStudentId.set(link.studentId, list);
  }

  let debtors = students.map((student) => {
    const assignment = assignmentByStudentId.get(student.id);
    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        studentNumber: student.studentNumber,
        emergencyContactName: student.emergencyContactName,
        emergencyContactPhone: student.emergencyContactPhone,
      },
      classInfo: assignment?.Class ? {
        classId: assignment.Class.id,
        className: assignment.Class.name,
        levelId: assignment.Class.levelId,
        levelName: assignment.Class.Level?.name,
      } : null,
      parents: (parentsByStudentId.get(student.id) || []).map((p) => ({
        id: p.id, fullName: p.fullName, phone: p.phone, email: p.email,
      })),
      // Expanded so the report can show how the balance was arrived at, not
      // just the net figure — billed and paid are each already summed above.
      billedPesewas: billedByStudent.get(student.id),
      paidPesewas: paidByStudent.get(student.id) || 0,
      balancePesewas: balanceByStudent.get(student.id),
    };
  });

  if (levelId || classId) {
    debtors = debtors.filter((d) => (classId ? d.classInfo?.classId === classId : d.classInfo?.levelId === levelId));
  }

  debtors.sort((a, b) => b.balancePesewas - a.balancePesewas);

  return {
    debtors,
    totalOutstandingPesewas: debtors.reduce((sum, d) => sum + d.balancePesewas, 0),
  };
}

const DEFAULT_DEBT_REMINDER_TEMPLATE = 'Dear Parent/Guardian, {studentName} has an outstanding balance of '
  + '{balance} at {schoolName}. Kindly settle this at your earliest convenience.';

function fillDebtReminderTemplate(template, { studentName, balancePesewas, schoolName }) {
  return template
    .replace(/\{studentName\}/g, studentName)
    .replace(/\{balance\}/g, formatAmountGHS(balancePesewas))
    .replace(/\{schoolName\}/g, schoolName || 'the school');
}

// Reuses messaging's sendBatch for the actual send+log mechanics, but owns
// recipient resolution and message text here — unlike a generic Compose
// broadcast, each debtor student must be reminded with THEIR OWN balance,
// so this is always one row per debtor student, never merged across
// siblings even if they share an emergency contact number.
//
// SMS goes to the student's Emergency Contact phone (a required field —
// always present) rather than a Parent record's phone; email goes to every
// linked parent's address (comma-joined into one send), since Student has
// no emergency-contact email field. A student with no linked parent at all
// still gets the SMS — previously (when SMS came from Parent.phone) such a
// student would have received nothing.
async function sendDebtReminders(schoolId, userId, { studentIds, messageTemplate }) {
  const { debtors } = await getDebtors(schoolId, {});
  const targets = debtors.filter((d) => studentIds.includes(d.student.id));
  if (targets.length === 0) {
    throw new ApiError(400, 'None of the selected students currently have an outstanding balance');
  }

  const links = await tenantScoped(StudentParent, schoolId).findAll({
    where: { studentId: targets.map((d) => d.student.id) },
    include: [Parent],
  });
  const emailsByStudentId = new Map();
  for (const link of links) {
    if (!link.Parent.email) continue;
    const emails = emailsByStudentId.get(link.studentId) || new Set();
    emails.add(link.Parent.email);
    emailsByStudentId.set(link.studentId, emails);
  }

  const recipients = targets.map((d) => ({
    type: 'PARENT',
    name: d.student.emergencyContactName || d.student.fullName,
    phone: d.student.emergencyContactPhone,
    email: [...(emailsByStudentId.get(d.student.id) || [])].join(', ') || null,
    studentId: d.student.id,
    studentName: d.student.fullName,
    balancePesewas: d.balancePesewas,
  }));

  const school = await School.findByPk(schoolId);
  const template = messageTemplate?.trim() || DEFAULT_DEBT_REMINDER_TEMPLATE;

  return messagingService.sendBatch(schoolId, {
    sentByUserId: userId,
    audience: 'PARENTS',
    source: 'DEBT_REMINDER',
    smsRequested: true,
    emailRequested: true,
    subject: 'Outstanding balance reminder',
    messageTemplate: template,
    recipients,
    buildMessage: (r) => {
      const text = fillDebtReminderTemplate(template, {
        studentName: r.studentName, balancePesewas: r.balancePesewas, schoolName: school?.name,
      });
      return { smsMessage: text, emailHtml: `<p>${text}</p>` };
    },
    extraRecipientFields: (r) => ({ studentId: r.studentId }),
  });
}

module.exports = {
  generateBills,
  listBills,
  addSpecialItem,
  removeBillItem,
  confirmBill,
  confirmBills,
  getStudentLedger,
  getStudentFinancialStatement,
  recordPayment,
  deletePayment,
  getReceiptData,
  listPayments,
  updateBillPayment,
  getPaymentRevisions,
  getPaymentAnalytics,
  getBillAnalytics,
  getDebtors,
  sendDebtReminders,
};
