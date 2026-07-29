const { Op } = require('sequelize');
const {
  sequelize, Vehicle, Staff, Student, StudentTransport, Route, PickupPoint, School, PickupRecord,
  DropoffRecord, TransportInvoice, TransportPayment, TransportPaymentRevision, Term, AcademicYear,
  CashAccount, User, VehicleTrip,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const assertNotSelfReversal = require('../../utils/assertNotSelfReversal');
const { notifyPickup, notifyDropoff, notifyTripStarted } = require('./notify');
const { notifyParentsOfStudent } = require('../notifications/service');
const { notifyPaymentReceipt } = require('../financials/notify');
const { postJournalEntry, reverseEntryFor } = require('../accounting/ledgerPoster');

// Every User include in this file must be scoped to this — full User rows
// carry passwordHash/resetPasswordTokenHash, which must never reach the API
// response (same convention as financials/service.js).
const USER_SUMMARY_ATTRIBUTES = ['id', 'fullName', 'email'];

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

// ---- Vehicles (setup) ----

async function listVehicles(schoolId) {
  const vehicles = await tenantScoped(Vehicle, schoolId).findAll({
    include: [{ model: Staff, as: 'driver' }],
    order: [['name', 'ASC']],
  });

  const enrolledCounts = await tenantScoped(StudentTransport, schoolId).findAll({
    where: { status: 'ENROLLED' },
    attributes: ['vehicleId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: ['vehicleId'],
  });
  const countByVehicleId = new Map(enrolledCounts.map((row) => [row.vehicleId, Number(row.get('count'))]));

  return vehicles.map((vehicle) => {
    const json = vehicle.toJSON();
    json.enrolledCount = countByVehicleId.get(vehicle.id) || 0;
    return json;
  });
}

async function assertDriverExists(schoolId, driverStaffId) {
  if (!driverStaffId) return;
  const staff = await tenantScoped(Staff, schoolId).findByPk(driverStaffId);
  if (!staff) throw new ApiError(400, 'driverStaffId does not refer to a valid staff member');
}

function toFeePesewasOrNull(value) {
  return value === undefined || value === null || value === '' ? null : Number(value);
}

async function createVehicle(schoolId, {
  name, registrationNumber, capacity, driverStaffId, status, termlyFeePesewas, monthlyFeePesewas,
}) {
  await assertDriverExists(schoolId, driverStaffId);
  return tenantScoped(Vehicle, schoolId).create({
    name,
    registrationNumber,
    capacity: Number(capacity),
    driverStaffId: driverStaffId || null,
    status: status || 'ACTIVE',
    termlyFeePesewas: toFeePesewasOrNull(termlyFeePesewas),
    monthlyFeePesewas: toFeePesewasOrNull(monthlyFeePesewas),
  });
}

async function updateVehicle(schoolId, vehicleId, {
  name, registrationNumber, capacity, driverStaffId, status, termlyFeePesewas, monthlyFeePesewas,
}) {
  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  await assertDriverExists(schoolId, driverStaffId);
  await vehicle.update({
    name,
    registrationNumber,
    capacity: Number(capacity),
    driverStaffId: driverStaffId || null,
    status,
    termlyFeePesewas: toFeePesewasOrNull(termlyFeePesewas),
    monthlyFeePesewas: toFeePesewasOrNull(monthlyFeePesewas),
  });
  return vehicle;
}

// A vehicle with students currently enrolled can't be removed outright —
// reassign or withdraw them first, so removing a vehicle never silently
// orphans a family's "which bus does my child use" answer. Historical
// (already-withdrawn) rows are cleared along with it, same convention as
// expenses/inventory's item-delete cascading their request rows.
async function deleteVehicle(schoolId, vehicleId) {
  const enrolledCount = await tenantScoped(StudentTransport, schoolId).count({
    where: { vehicleId, status: 'ENROLLED' },
  });
  if (enrolledCount > 0) {
    throw new ApiError(400, `Reassign or withdraw ${enrolledCount} student${enrolledCount === 1 ? '' : 's'} from this vehicle before removing it.`);
  }

  // A vehicle that has ever been invoiced against can't be removed either —
  // transport_invoices.vehicleId (and, transitively, the student_transport
  // rows below) are NO ACTION foreign keys, so deleting it out from under
  // billing history would otherwise surface as a raw FK-violation error.
  const invoiceCount = await tenantScoped(TransportInvoice, schoolId).count({ where: { vehicleId } });
  if (invoiceCount > 0) {
    throw new ApiError(400, 'This vehicle has transport billing history and cannot be removed.');
  }

  await sequelize.transaction(async (transaction) => {
    await tenantScoped(StudentTransport, schoolId).destroy({ where: { vehicleId }, transaction });
    const routeIds = (await tenantScoped(Route, schoolId).findAll({ where: { vehicleId }, transaction })).map((r) => r.id);
    if (routeIds.length > 0) {
      await tenantScoped(PickupPoint, schoolId).destroy({ where: { routeId: routeIds }, transaction });
      await tenantScoped(Route, schoolId).destroy({ where: { vehicleId }, transaction });
    }
    const deleted = await tenantScoped(Vehicle, schoolId).destroy({ where: { id: vehicleId }, transaction });
    if (!deleted) throw new ApiError(404, 'Vehicle not found');
  });
}

// ---- Routes & pickup points (setup) ----

async function listRoutes(schoolId, { vehicleId } = {}) {
  return tenantScoped(Route, schoolId).findAll({
    where: vehicleId ? { vehicleId } : undefined,
    include: [Vehicle, { model: PickupPoint }],
    order: [['name', 'ASC'], [PickupPoint, 'sequenceOrder', 'ASC']],
  });
}

async function createRoute(schoolId, { vehicleId, name, notes }) {
  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  return tenantScoped(Route, schoolId).create({ vehicleId, name, notes: notes || null });
}

async function updateRoute(schoolId, routeId, { name, notes }) {
  const route = await tenantScoped(Route, schoolId).findByPk(routeId);
  if (!route) throw new ApiError(404, 'Route not found');
  await route.update({ name, notes: notes || null });
  return route;
}

// Removing a route also removes its pickup points; any student whose
// pickupPointId pointed at one of them just loses that specific detail
// (pickupPointId is nullable) rather than blocking the whole deletion —
// unlike Vehicle/Route-holding-students, a missing pickup point is a minor,
// easily-fixed gap, not a silently orphaned "which bus" answer.
async function deleteRoute(schoolId, routeId) {
  await sequelize.transaction(async (transaction) => {
    const pointIds = (await tenantScoped(PickupPoint, schoolId).findAll({ where: { routeId }, transaction })).map((p) => p.id);
    if (pointIds.length > 0) {
      await tenantScoped(StudentTransport, schoolId).update(
        { pickupPointId: null },
        { where: { pickupPointId: pointIds }, transaction },
      );
      await tenantScoped(PickupPoint, schoolId).destroy({ where: { routeId }, transaction });
    }
    const deleted = await tenantScoped(Route, schoolId).destroy({ where: { id: routeId }, transaction });
    if (!deleted) throw new ApiError(404, 'Route not found');
  });
}

async function createPickupPoint(schoolId, {
  routeId, name, scheduledTime, sequenceOrder,
}) {
  const route = await tenantScoped(Route, schoolId).findByPk(routeId);
  if (!route) throw new ApiError(404, 'Route not found');
  return tenantScoped(PickupPoint, schoolId).create({
    routeId, name, scheduledTime, sequenceOrder: sequenceOrder !== undefined ? Number(sequenceOrder) : 0,
  });
}

async function updatePickupPoint(schoolId, pointId, { name, scheduledTime, sequenceOrder }) {
  const point = await tenantScoped(PickupPoint, schoolId).findByPk(pointId);
  if (!point) throw new ApiError(404, 'Pickup point not found');
  await point.update({
    name, scheduledTime, sequenceOrder: sequenceOrder !== undefined ? Number(sequenceOrder) : point.sequenceOrder,
  });
  return point;
}

async function deletePickupPoint(schoolId, pointId) {
  await sequelize.transaction(async (transaction) => {
    await tenantScoped(StudentTransport, schoolId).update(
      { pickupPointId: null },
      { where: { pickupPointId: pointId }, transaction },
    );
    const deleted = await tenantScoped(PickupPoint, schoolId).destroy({ where: { id: pointId }, transaction });
    if (!deleted) throw new ApiError(404, 'Pickup point not found');
  });
}

// ---- Student transport roster ----

const ROSTER_INCLUDE = [Student, Vehicle, PickupPoint];

async function listStudentTransport(schoolId, { vehicleId, status } = {}) {
  const where = {};
  if (vehicleId) where.vehicleId = vehicleId;
  if (status) where.status = status;

  return tenantScoped(StudentTransport, schoolId).findAll({
    where,
    include: ROSTER_INCLUDE,
    order: [['createdAt', 'DESC']],
  });
}

// A pickup point only makes sense if it's on one of this vehicle's own
// routes — otherwise "board vehicle A at a stop on vehicle B's route" is
// nonsensical and would silently mislead the pickup-alert SMS.
async function assertPickupPointOnVehicle(schoolId, pickupPointId, vehicleId) {
  if (!pickupPointId) return;
  const point = await tenantScoped(PickupPoint, schoolId).findByPk(pickupPointId, { include: [Route] });
  if (!point || point.Route.vehicleId !== vehicleId) {
    throw new ApiError(400, "This pickup point isn't on a route for the selected vehicle");
  }
}

// Any not-yet-paid invoice belonging to a subscription is safe to discard —
// zero payments means nothing to reconcile for the family, only the journal
// entry it posted. Shared by createConfirmingInvoice (superseding a stale
// unpaid invoice on reassignment) and deleteStudentTransport (cancelling a
// subscription outright).
async function deleteUnpaidInvoices(schoolId, studentTransportId, userId, reason, transaction) {
  const invoices = await tenantScoped(TransportInvoice, schoolId).findAll({ where: { studentTransportId }, transaction });
  for (const invoice of invoices) {
    // eslint-disable-next-line no-await-in-loop
    const paymentCount = await tenantScoped(TransportPayment, schoolId).count({ where: { transportInvoiceId: invoice.id }, transaction });
    if (paymentCount > 0) continue; // real payment history — never auto-deleted
    // eslint-disable-next-line no-await-in-loop
    await reverseEntryFor(schoolId, 'TRANSPORT_INVOICE', invoice.id, { userId, reason }, transaction);
    // eslint-disable-next-line no-await-in-loop
    await tenantScoped(TransportInvoice, schoolId).destroy({ where: { id: invoice.id }, transaction });
  }
}

// Raises the invoice that must be paid before a subscription counts as
// confirmed (see tryConfirmSubscription), for the current period at the
// subscription's own vehicle+cycle. wasNeverConfirmed gates the "supersede a
// stale unpaid invoice" step — that's only correct while this subscription
// has never been paid off before; once ENROLLED, its past invoices are real
// billing history for time already spent on a vehicle and must survive a
// later reassignment untouched.
async function createConfirmingInvoice(schoolId, subscription, period, amountPesewas, userId, wasNeverConfirmed) {
  await sequelize.transaction(async (transaction) => {
    if (wasNeverConfirmed) {
      await deleteUnpaidInvoices(schoolId, subscription.id, userId, 'Superseded by a new subscription assignment', transaction);
    }

    const existingForPeriod = await tenantScoped(TransportInvoice, schoolId).findOne({
      where: { studentTransportId: subscription.id, periodKey: period.periodKey },
      transaction,
    });
    if (existingForPeriod) return;

    const invoice = await tenantScoped(TransportInvoice, schoolId).create({
      studentTransportId: subscription.id,
      studentId: subscription.studentId,
      vehicleId: subscription.vehicleId,
      billingCycle: subscription.billingCycle,
      termId: period.termId,
      academicYearId: period.academicYearId,
      periodMonth: period.periodMonth,
      periodYear: period.periodYear,
      periodKey: period.periodKey,
      periodLabel: period.periodLabel,
      dueDate: period.dueDate,
      amountPesewas,
      createdByUserId: userId,
    }, { transaction });
    await postTransportInvoice(schoolId, invoice, userId, transaction);
  });
}

// One row per student — assigning again (whether re-enrolling or switching
// buses) updates the existing row instead of creating a second one, the
// same upsert-on-conflict shape as assignSubjectTeacher. A subscription
// never starts (or returns to) ENROLLED here — every fresh assignment goes
// to PENDING_PAYMENT with a freshly-raised confirming invoice, and only
// tryConfirmSubscription (on full payment) flips it to ENROLLED. The one
// exception is a same-vehicle, same-cycle edit on an already-confirmed
// subscription (pickup point/notes) — that's not a new charge.
async function assignStudentTransport(schoolId, userId, {
  studentId, vehicleId, pickupPointId, startDate, notes, billingCycle,
}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  if (vehicle.status !== 'ACTIVE') throw new ApiError(400, 'This vehicle is inactive');

  await assertPickupPointOnVehicle(schoolId, pickupPointId, vehicleId);

  const existing = await tenantScoped(StudentTransport, schoolId).findOne({ where: { studentId } });

  // A seat only counts as taken once a subscription is confirmed (paid) —
  // PENDING_PAYMENT rows don't hold capacity, so two families can be
  // mid-payment for the same last seat; whoever's invoice clears first gets
  // it (see tryConfirmSubscription), and the loser has to be reassigned.
  const enrolledCount = await tenantScoped(StudentTransport, schoolId).count({
    where: { vehicleId, status: 'ENROLLED' },
  });
  const alreadyConfirmedOnThisVehicle = existing && existing.vehicleId === vehicleId && existing.status === 'ENROLLED';
  if (!alreadyConfirmedOnThisVehicle && enrolledCount >= vehicle.capacity) {
    throw new ApiError(400, `${vehicle.name} is full (${enrolledCount}/${vehicle.capacity} seats taken).`);
  }

  const resolvedBillingCycle = billingCycle || existing?.billingCycle || 'TERMLY';

  // Already confirmed on this exact vehicle+cycle — a detail edit (pickup
  // point, notes), not a new charge, so their confirmed status and existing
  // invoices are left alone.
  if (alreadyConfirmedOnThisVehicle && existing.billingCycle === resolvedBillingCycle) {
    await existing.update({
      pickupPointId: pickupPointId || null,
      startDate,
      endDate: null,
      notes: notes || null,
    });
    return tenantScoped(StudentTransport, schoolId).findByPk(existing.id, { include: ROSTER_INCLUDE });
  }

  // Every other case (first subscribe, re-subscribing a withdrawn student, or
  // moving to a different vehicle/cycle) starts a fresh payment cycle. Rate
  // and current-period are resolved — and can fail — before anything is
  // written, so a rejected assignment never leaves a pending subscription
  // with no invoice behind.
  const amountPesewas = resolvedBillingCycle === 'TERMLY' ? vehicle.termlyFeePesewas : vehicle.monthlyFeePesewas;
  if (amountPesewas === null || amountPesewas === undefined) {
    const cycleLabel = resolvedBillingCycle === 'TERMLY' ? 'termly' : 'monthly';
    throw new ApiError(400, `${vehicle.name} has no ${cycleLabel} rate set — set one under Vehicles before subscribing students on this cycle.`);
  }
  const period = await resolveCurrentPeriod(schoolId, resolvedBillingCycle);

  const wasNeverConfirmed = !existing || existing.status !== 'ENROLLED';
  const record = existing
    ? await existing.update({
      vehicleId,
      pickupPointId: pickupPointId || null,
      status: 'PENDING_PAYMENT',
      startDate,
      endDate: null,
      notes: notes || null,
      billingCycle: resolvedBillingCycle,
    })
    : await tenantScoped(StudentTransport, schoolId).create({
      studentId,
      vehicleId,
      pickupPointId: pickupPointId || null,
      status: 'PENDING_PAYMENT',
      startDate,
      notes: notes || null,
      billingCycle: resolvedBillingCycle,
    });

  await createConfirmingInvoice(schoolId, record, period, amountPesewas, userId, wasNeverConfirmed);

  return tenantScoped(StudentTransport, schoolId).findByPk(record.id, { include: ROSTER_INCLUDE });
}

async function withdrawStudentTransport(schoolId, id) {
  const record = await tenantScoped(StudentTransport, schoolId).findByPk(id);
  if (!record) throw new ApiError(404, 'Transport record not found');
  if (record.status === 'WITHDRAWN') throw new ApiError(400, 'This student has already been withdrawn from transport');

  await record.update({ status: 'WITHDRAWN', endDate: new Date().toISOString().slice(0, 10) });
  return tenantScoped(StudentTransport, schoolId).findByPk(record.id, { include: ROSTER_INCLUDE });
}

async function deleteStudentTransport(schoolId, id, userId) {
  const invoices = await tenantScoped(TransportInvoice, schoolId).findAll({ where: { studentTransportId: id } });
  const invoiceIds = invoices.map((i) => i.id);
  const paidInvoiceCount = invoiceIds.length > 0
    ? await tenantScoped(TransportPayment, schoolId).count({ where: { transportInvoiceId: invoiceIds } })
    : 0;
  if (paidInvoiceCount > 0) {
    throw new ApiError(400, 'This student has transport payment history — withdraw them instead of removing the record.');
  }

  await sequelize.transaction(async (transaction) => {
    await deleteUnpaidInvoices(schoolId, id, userId, 'Subscription removed', transaction);
    const deleted = await tenantScoped(StudentTransport, schoolId).destroy({ where: { id }, transaction });
    if (!deleted) throw new ApiError(404, 'Transport record not found');
  });
}

// ---- Pickup alert (manual SMS trigger) ----
// Texts the parents of every enrolled student on this vehicle who has a
// pickup point set, with that student's stop + time. Best-effort — wrapped
// so a provider failure never surfaces as a 500, same shape as
// financials/service.js#sendDebtReminders.
async function sendPickupAlert(schoolId, vehicleId) {
  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');

  const roster = await tenantScoped(StudentTransport, schoolId).findAll({
    where: { vehicleId, status: 'ENROLLED' },
    include: [Student, PickupPoint],
  });

  const withPickupPoint = roster.filter((r) => r.PickupPoint);
  const skippedNoPickupPoint = roster.length - withPickupPoint.length;

  const school = await School.findByPk(schoolId);
  const summary = await notifyPickup(schoolId, {
    school,
    vehicleName: vehicle.name,
    entries: withPickupPoint.map((r) => ({
      studentId: r.studentId,
      studentName: r.Student.fullName,
      pickupPointName: r.PickupPoint.name,
      scheduledTime: r.PickupPoint.scheduledTime,
    })),
  });

  return { ...summary, skippedNoPickupPoint, totalOnRoster: roster.length };
}

// ---- Pickup records (daily check-in, recorded by admin/front-desk) ----
// Same one-GET-and-one-PUT-per-{scope+date} shape as
// attendance/service.js#getRegister/saveRegister, with vehicleId in place of
// classId — no driver login required (see plan decision), a school admin or
// front-desk records what the driver reports on arrival.

async function getPickupRecord(schoolId, { vehicleId, date }) {
  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');

  const roster = await tenantScoped(StudentTransport, schoolId).findAll({
    where: { vehicleId, status: 'ENROLLED' },
    include: [Student, PickupPoint],
    order: [[Student, 'lastName', 'ASC'], [Student, 'firstName', 'ASC']],
  });

  const records = await tenantScoped(PickupRecord, schoolId).findAll({ where: { vehicleId, date } });
  const statuses = {};
  for (const record of records) statuses[record.studentId] = record.status;

  return {
    vehicle,
    students: roster.map((r) => ({
      id: r.studentId,
      fullName: r.Student.fullName,
      studentNumber: r.Student.studentNumber,
      pickupPoint: r.PickupPoint ? { name: r.PickupPoint.name, scheduledTime: r.PickupPoint.scheduledTime } : null,
    })),
    statuses,
  };
}

async function savePickupRecord(schoolId, userId, { vehicleId, date, records }) {
  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');

  const results = [];
  for (const { studentId, status } of records) {
    const existing = await tenantScoped(PickupRecord, schoolId).findOne({ where: { studentId, date } });
    if (existing) {
      // eslint-disable-next-line no-await-in-loop
      await existing.update({
        vehicleId, status, recordedByUserId: userId,
      });
      results.push(existing);
    } else {
      // eslint-disable-next-line no-await-in-loop
      const created = await tenantScoped(PickupRecord, schoolId).create({
        studentId, vehicleId, date, status, recordedByUserId: userId,
      });
      results.push(created);
    }
  }

  return { savedCount: results.length };
}

// ---- Per-student pickup history (admin report) ----
// Every recorded pickup/miss for one student over a date range, plus a
// picked-up/missed/rate summary — distinct from getPickupRecord above,
// which is scoped to one vehicle+date for the daily check-in entry screen.
async function getStudentPickupHistory(schoolId, studentId, { from, to } = {}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const where = { studentId };
  if (from && to) where.date = { [Op.between]: [from, to] };
  else if (from) where.date = { [Op.gte]: from };
  else if (to) where.date = { [Op.lte]: to };

  const records = await tenantScoped(PickupRecord, schoolId).findAll({
    where,
    include: [Vehicle],
    order: [['date', 'DESC']],
  });

  const pickedUpCount = records.filter((r) => r.status === 'PICKED_UP').length;
  const missedCount = records.filter((r) => r.status === 'MISSED').length;

  return {
    student,
    records: records.map((r) => ({
      date: r.date, status: r.status, vehicleName: r.Vehicle?.name || null, notes: r.notes,
    })),
    summary: {
      totalCount: records.length,
      pickedUpCount,
      missedCount,
      pickupRatePercent: records.length > 0 ? Math.round((pickedUpCount / records.length) * 100) : 0,
    },
  };
}

// ---- Drop-off records (live, recorded by whoever's riding the bus) ----
// Unlike pickup (one admin/front-desk batch save per vehicle+date, after the
// fact), a drop-off is recorded one student at a time, in the field, the
// moment it happens — recordStudentDropoff both writes the row and fires the
// parent SMS/email immediately, rather than a separate save-then-alert step.

// The roster + who's already been recorded today — same shape as
// getPickupRecord, so the recording page can show "done" vs "not yet" per
// student on this vehicle.
async function getDropoffRecord(schoolId, { vehicleId, date }) {
  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');

  const roster = await tenantScoped(StudentTransport, schoolId).findAll({
    where: { vehicleId, status: 'ENROLLED' },
    include: [Student, PickupPoint],
    order: [[Student, 'lastName', 'ASC'], [Student, 'firstName', 'ASC']],
  });

  const records = await tenantScoped(DropoffRecord, schoolId).findAll({ where: { vehicleId, date } });
  const recordsByStudentId = {};
  for (const record of records) {
    recordsByStudentId[record.studentId] = {
      droppedOffAt: record.droppedOffAt,
      latitude: record.latitude,
      longitude: record.longitude,
      notes: record.notes,
    };
  }

  return {
    vehicle,
    students: roster.map((r) => ({
      id: r.studentId,
      fullName: r.Student.fullName,
      studentNumber: r.Student.studentNumber,
      // Biodata useful for a staff member confirming they have the right
      // child in front of them before recording — pickup point isn't
      // necessarily where they're dropped, but it's the best "does this
      // look right" reference this app has per student.
      dateOfBirth: r.Student.dateOfBirth,
      gender: r.Student.gender,
      pickupPoint: r.PickupPoint ? { name: r.PickupPoint.name, scheduledTime: r.PickupPoint.scheduledTime } : null,
    })),
    records: recordsByStudentId,
  };
}

// One student, recorded now — droppedOffAt is always the server clock at
// the moment this runs (see the model comment), never client-supplied.
// Upserts on (studentId, date) same as savePickupRecord, so re-recording the
// same student on the same day corrects the existing row instead of
// erroring on the unique index.
async function recordStudentDropoff(schoolId, userId, {
  studentId, vehicleId, latitude, longitude, notes,
}) {
  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');

  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const subscription = await tenantScoped(StudentTransport, schoolId).findOne({
    where: { studentId, status: 'ENROLLED' },
  });
  if (!subscription || subscription.vehicleId !== vehicleId) {
    throw new ApiError(400, `${student.fullName} is not on this vehicle's current roster`);
  }

  const droppedOffAt = new Date();
  const date = droppedOffAt.toISOString().slice(0, 10);
  const values = {
    vehicleId,
    droppedOffAt,
    latitude: latitude === undefined || latitude === null || latitude === '' ? null : Number(latitude),
    longitude: longitude === undefined || longitude === null || longitude === '' ? null : Number(longitude),
    notes: notes || null,
    recordedByUserId: userId,
  };

  const existing = await tenantScoped(DropoffRecord, schoolId).findOne({ where: { studentId, date } });
  const record = existing
    ? await existing.update(values)
    : await tenantScoped(DropoffRecord, schoolId).create({ studentId, date, ...values });

  let notifications = { sms: { attempted: 0, sent: 0, failed: 0 }, email: { attempted: 0, sent: 0, failed: 0 } };
  try {
    const school = await School.findByPk(schoolId);
    notifications = await notifyDropoff(schoolId, {
      school,
      studentId,
      studentName: student.fullName,
      vehicleName: vehicle.name,
      droppedOffAt,
      latitude: record.latitude,
      longitude: record.longitude,
    });
  } catch (err) {
    notifications.error = err.message;
  }

  return { record, notifications };
}

// ---- Per-student drop-off history (admin report) ----
async function getStudentDropoffHistory(schoolId, studentId, { from, to } = {}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const where = { studentId };
  if (from && to) where.date = { [Op.between]: [from, to] };
  else if (from) where.date = { [Op.gte]: from };
  else if (to) where.date = { [Op.lte]: to };

  const records = await tenantScoped(DropoffRecord, schoolId).findAll({
    where,
    include: [Vehicle],
    order: [['droppedOffAt', 'DESC']],
  });

  return {
    student,
    records: records.map((r) => ({
      date: r.date,
      droppedOffAt: r.droppedOffAt,
      vehicleName: r.Vehicle?.name || null,
      latitude: r.latitude,
      longitude: r.longitude,
      notes: r.notes,
    })),
    summary: { totalCount: records.length },
  };
}

// ---- Fleet-wide pickup/drop-off reports (admin, any period, any vehicle/driver) ----
// Shared by getPickupReport and getDropoffReport below — both are "every
// record matching these filters," just over a different table. A driver
// isn't a queryable column on either record (see Vehicle.driverStaffId) —
// filtering "this driver's records" means first resolving which vehicles
// they drive, then filtering by those vehicle IDs. termId/academicYearId
// aren't columns on the records either (only a raw `date`) — resolved into
// a date range against Term/AcademicYear's own startDate/endDate, same
// technique as resolveAcademicYearForDate/resolveInvoicePeriod above.
async function resolveReportFilters(schoolId, {
  vehicleId, driverStaffId, academicYearId, termId, from, to,
} = {}) {
  const where = {};

  if (driverStaffId) {
    const vehicles = await tenantScoped(Vehicle, schoolId).findAll({
      where: vehicleId ? { id: vehicleId, driverStaffId } : { driverStaffId },
      attributes: ['id'],
    });
    where.vehicleId = { [Op.in]: vehicles.map((v) => v.id) };
  } else if (vehicleId) {
    where.vehicleId = vehicleId;
  }

  let dateFrom = from;
  let dateTo = to;
  if (termId) {
    const term = await tenantScoped(Term, schoolId).findByPk(termId);
    if (!term) throw new ApiError(404, 'Term not found');
    dateFrom = term.startDate;
    dateTo = term.endDate;
  } else if (academicYearId) {
    const academicYear = await tenantScoped(AcademicYear, schoolId).findByPk(academicYearId);
    if (!academicYear) throw new ApiError(404, 'Academic year not found');
    dateFrom = academicYear.startDate;
    dateTo = academicYear.endDate;
  }

  if (dateFrom && dateTo) where.date = { [Op.between]: [dateFrom, dateTo] };
  else if (dateFrom) where.date = { [Op.gte]: dateFrom };
  else if (dateTo) where.date = { [Op.lte]: dateTo };

  return where;
}

const VEHICLE_WITH_DRIVER_INCLUDE = { model: Vehicle, include: [{ model: Staff, as: 'driver', attributes: ['id', 'fullName'] }] };

async function getPickupReport(schoolId, filters = {}) {
  const where = await resolveReportFilters(schoolId, filters);

  const records = await tenantScoped(PickupRecord, schoolId).findAll({
    where,
    include: [Student, VEHICLE_WITH_DRIVER_INCLUDE],
    order: [['date', 'DESC']],
  });

  const pickedUpCount = records.filter((r) => r.status === 'PICKED_UP').length;
  const missedCount = records.filter((r) => r.status === 'MISSED').length;

  return {
    totalCount: records.length,
    summary: {
      pickedUpCount,
      missedCount,
      pickupRatePercent: records.length > 0 ? Math.round((pickedUpCount / records.length) * 100) : 0,
    },
    records: records.map((r) => ({
      id: r.id,
      studentName: r.Student?.fullName || null,
      studentNumber: r.Student?.studentNumber || null,
      vehicleName: r.Vehicle?.name || null,
      driverName: r.Vehicle?.driver?.fullName || null,
      date: r.date,
      status: r.status,
      notes: r.notes,
    })),
  };
}

// ---- Drop-off report (admin, any period, all students) ----
async function getDropoffReport(schoolId, filters = {}) {
  const where = await resolveReportFilters(schoolId, filters);

  const records = await tenantScoped(DropoffRecord, schoolId).findAll({
    where,
    include: [Student, VEHICLE_WITH_DRIVER_INCLUDE],
    order: [['droppedOffAt', 'DESC']],
  });

  return {
    totalCount: records.length,
    records: records.map((r) => ({
      id: r.id,
      studentName: r.Student?.fullName || null,
      studentNumber: r.Student?.studentNumber || null,
      vehicleName: r.Vehicle?.name || null,
      driverName: r.Vehicle?.driver?.fullName || null,
      date: r.date,
      droppedOffAt: r.droppedOffAt,
      latitude: r.latitude,
      longitude: r.longitude,
      notes: r.notes,
    })),
  };
}

// ---- Drop-off analytics ----
// "Location" buckets are built by clustering the actual recorded GPS
// coordinates within a small radius of each other — not the student's
// nominal pickup point — so this reflects where drop-offs are really
// happening, not just where the route was planned to stop. Records with no
// captured location (geolocation denied/unavailable) are counted separately
// and excluded from location clustering.

const LOCATION_CLUSTER_RADIUS_METERS = 150;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeOfDayMinutes(date) {
  const d = new Date(date);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function averageMinutes(values) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

async function getDropoffAnalytics(schoolId, { vehicleId, from, to } = {}) {
  const where = {};
  if (vehicleId) where.vehicleId = vehicleId;
  if (from && to) where.date = { [Op.between]: [from, to] };
  else if (from) where.date = { [Op.gte]: from };
  else if (to) where.date = { [Op.lte]: to };

  const records = await tenantScoped(DropoffRecord, schoolId).findAll({
    where,
    include: [Vehicle],
    order: [['droppedOffAt', 'ASC']],
  });

  const withLocation = records.filter((r) => r.latitude !== null && r.longitude !== null);
  const noLocationCount = records.length - withLocation.length;

  // PickupPoint has no coordinates of its own, so a cluster can't be matched
  // to one by distance — instead, each cluster is named after whichever
  // pickup point most of its own students are actually assigned to. That's
  // a proxy, not a geometric match, but it's free (no new schema, no
  // external geocoding) and grounded in real assignment data rather than a
  // manually-maintained stop coordinate that could drift out of date.
  const studentIdsWithLocation = [...new Set(withLocation.map((r) => r.studentId))];
  const subscriptions = studentIdsWithLocation.length > 0
    ? await tenantScoped(StudentTransport, schoolId).findAll({
      where: { studentId: studentIdsWithLocation },
      include: [PickupPoint],
    })
    : [];
  const pickupPointNameByStudentId = new Map(
    subscriptions.map((s) => [s.studentId, s.PickupPoint?.name || null]),
  );

  // Greedy single-pass clustering — each record joins the first existing
  // cluster within radius of its running centroid, else starts a new one.
  // Not order-independent/optimal, but proportional to the scale this
  // feature actually needs (one school's drop-offs over a term, not a
  // citywide dataset).
  const clusters = [];
  for (const record of withLocation) {
    const lat = Number(record.latitude);
    const lng = Number(record.longitude);
    const cluster = clusters.find(
      (c) => haversineMeters(c.latSum / c.count, c.lngSum / c.count, lat, lng) <= LOCATION_CLUSTER_RADIUS_METERS,
    );
    if (cluster) {
      cluster.latSum += lat;
      cluster.lngSum += lng;
      cluster.count += 1;
      cluster.records.push(record);
    } else {
      clusters.push({
        latSum: lat, lngSum: lng, count: 1, records: [record],
      });
    }
  }

  const locations = clusters
    .map((c) => {
      const times = c.records.map((r) => timeOfDayMinutes(r.droppedOffAt));

      // Majority vote among this cluster's own drop-off events — ties break
      // toward whichever pickup point was seen first, which is an arbitrary
      // but stable choice.
      const nameTally = new Map();
      for (const record of c.records) {
        const name = pickupPointNameByStudentId.get(record.studentId);
        if (name) nameTally.set(name, (nameTally.get(name) || 0) + 1);
      }
      let nearestPickupPointName = null;
      let bestCount = 0;
      for (const [name, count] of nameTally) {
        if (count > bestCount) {
          nearestPickupPointName = name;
          bestCount = count;
        }
      }

      return {
        centroidLatitude: c.latSum / c.count,
        centroidLongitude: c.lngSum / c.count,
        dropoffCount: c.count,
        averageDropoffTimeMinutes: averageMinutes(times),
        nearestPickupPointName,
        nearestPickupPointMatchCount: bestCount,
      };
    })
    .sort((a, b) => b.dropoffCount - a.dropoffCount)
    // Labeled after sorting so an unnamed cluster's fallback number still
    // reflects its rank — the label overall is just a display convenience,
    // not a stable cluster identity across requests.
    .map((loc, index) => ({
      ...loc,
      label: loc.nearestPickupPointName ? `Near ${loc.nearestPickupPointName}` : `Unnamed location ${index + 1}`,
    }));

  // Two clusters can resolve to the same pickup point name (e.g. only one
  // stop is configured near two genuinely different physical spots) —
  // disambiguate rather than show duplicate labels.
  const labelTotals = new Map();
  for (const loc of locations) labelTotals.set(loc.label, (labelTotals.get(loc.label) || 0) + 1);
  const labelSeen = new Map();
  for (const loc of locations) {
    if (labelTotals.get(loc.label) > 1) {
      const occurrence = (labelSeen.get(loc.label) || 0) + 1;
      labelSeen.set(loc.label, occurrence);
      loc.label = `${loc.label} (${occurrence})`;
    }
  }

  const perVehicleMap = new Map();
  for (const record of records) {
    const entry = perVehicleMap.get(record.vehicleId) || {
      vehicleId: record.vehicleId, vehicleName: record.Vehicle?.name || null, times: [],
    };
    entry.times.push(timeOfDayMinutes(record.droppedOffAt));
    perVehicleMap.set(record.vehicleId, entry);
  }
  const perVehicle = [...perVehicleMap.values()]
    .map((v) => ({
      vehicleId: v.vehicleId,
      vehicleName: v.vehicleName,
      dropoffCount: v.times.length,
      averageDropoffTimeMinutes: averageMinutes(v.times),
      earliestDropoffTimeMinutes: Math.min(...v.times),
      latestDropoffTimeMinutes: Math.max(...v.times),
    }))
    .sort((a, b) => b.dropoffCount - a.dropoffCount);

  const allTimes = records.map((r) => timeOfDayMinutes(r.droppedOffAt));

  return {
    totalDropoffs: records.length,
    noLocationCount,
    fleetAverageDropoffTimeMinutes: averageMinutes(allTimes),
    earliestDropoffTimeMinutes: allTimes.length > 0 ? Math.min(...allTimes) : null,
    latestDropoffTimeMinutes: allTimes.length > 0 ? Math.max(...allTimes) : null,
    perVehicle,
    locations,
  };
}

// ---- Transport billing: invoice generation ----
// StudentTransport IS the subscription (vehicle + billingCycle); an invoice
// is a materialized charge for one period, generated on demand (no draft/
// confirm step — the amount is just the vehicle's current rate, nothing to
// negotiate line-by-line the way a tuition Bill has). Mirrors
// financials/service.js#generateBills' idempotent create-or-skip shape.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

// MONTHLY invoices carry no termId, so their academic year has to be
// resolved from the due date against each academic year's own range —
// there's no other link to follow.
async function resolveAcademicYearForDate(schoolId, dateStr) {
  return tenantScoped(AcademicYear, schoolId).findOne({
    where: { startDate: { [Op.lte]: dateStr }, endDate: { [Op.gte]: dateStr } },
  });
}

async function resolveInvoicePeriod(schoolId, {
  billingCycle, termId, month, year,
}) {
  if (billingCycle === 'TERMLY') {
    if (!termId) throw new ApiError(400, 'termId is required for termly billing');
    const term = await tenantScoped(Term, schoolId).findByPk(termId, { include: [AcademicYear] });
    if (!term) throw new ApiError(404, 'Term not found');
    return {
      periodKey: term.id,
      periodLabel: `${term.name} (${term.AcademicYear?.name || ''})`.trim(),
      dueDate: term.startDate,
      termId: term.id,
      academicYearId: term.academicYearId,
      periodMonth: null,
      periodYear: null,
    };
  }

  const monthNum = Number(month);
  const yearNum = Number(year);
  if (!monthNum || monthNum < 1 || monthNum > 12) throw new ApiError(400, 'month is required and must be 1-12 for monthly billing');
  if (!yearNum) throw new ApiError(400, 'year is required for monthly billing');
  const dueDate = `${yearNum}-${pad2(monthNum)}-01`;
  const academicYear = await resolveAcademicYearForDate(schoolId, dueDate);
  return {
    periodKey: `${yearNum}-${pad2(monthNum)}`,
    periodLabel: `${MONTH_NAMES[monthNum - 1]} ${yearNum}`,
    dueDate,
    termId: null,
    academicYearId: academicYear ? academicYear.id : null,
    periodMonth: monthNum,
    periodYear: yearNum,
  };
}

// Batch generation (generateTransportInvoices) takes an explicit period from
// the admin; a brand-new subscription doesn't have that luxury — it needs
// "whatever period is happening right now" so a confirming invoice can be
// raised immediately. TERMLY uses the school's isCurrent term (same lookup
// convention as financials/service.js#getStudentClassLabel); MONTHLY just
// uses today's calendar month.
async function resolveCurrentPeriod(schoolId, billingCycle) {
  if (billingCycle === 'TERMLY') {
    const term = await tenantScoped(Term, schoolId).findOne({ where: { isCurrent: true } });
    if (!term) {
      throw new ApiError(400, 'No current term is set — set one under Academic Years before subscribing students to termly transport.');
    }
    return resolveInvoicePeriod(schoolId, { billingCycle, termId: term.id });
  }
  const now = new Date();
  return resolveInvoicePeriod(schoolId, { billingCycle, month: now.getMonth() + 1, year: now.getFullYear() });
}

async function postTransportInvoice(schoolId, invoice, userId, transaction) {
  await postJournalEntry(schoolId, {
    entryDate: invoice.dueDate,
    description: `Transport fee invoiced — ${invoice.periodLabel}`,
    sourceType: 'TRANSPORT_INVOICE',
    sourceId: invoice.id,
    userId,
    lines: [
      { accountCode: '1100', debitPesewas: invoice.amountPesewas, studentId: invoice.studentId },
      { accountCode: '4060', creditPesewas: invoice.amountPesewas, studentId: invoice.studentId },
    ],
  }, transaction);
}

// Shared by generateTransportInvoices (which acts on this) and
// previewTransportInvoices (which only reports it) — one classification
// pass so "what the preview showed" and "what generation actually did"
// can't drift apart.
async function classifyTransportInvoiceCandidates(schoolId, billingCycle, period) {
  const subscriptions = await tenantScoped(StudentTransport, schoolId).findAll({
    where: { status: 'ENROLLED', billingCycle },
    include: [Vehicle, { model: Student, attributes: ['id', 'firstName', 'middleName', 'lastName'] }],
    order: [[Student, 'lastName', 'ASC'], [Student, 'firstName', 'ASC']],
  });

  const candidates = [];
  for (const subscription of subscriptions) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await tenantScoped(TransportInvoice, schoolId).findOne({
      where: { studentTransportId: subscription.id, periodKey: period.periodKey },
    });
    const amountPesewas = billingCycle === 'TERMLY'
      ? subscription.Vehicle.termlyFeePesewas
      : subscription.Vehicle.monthlyFeePesewas;

    let status = 'PENDING'; // will get a new invoice
    if (existing) status = 'ALREADY_INVOICED';
    else if (amountPesewas === null || amountPesewas === undefined) status = 'NO_RATE';

    candidates.push({
      subscription, status, amountPesewas,
    });
  }
  return candidates;
}

// Dry run of generateTransportInvoices — same subscription set and same
// skip rules, but nothing is written. Lets the admin see who's about to be
// billed (and who'll be skipped, and why) before committing.
async function previewTransportInvoices(schoolId, {
  billingCycle, termId, month, year,
}) {
  if (!StudentTransport.BILLING_CYCLES.includes(billingCycle)) {
    throw new ApiError(400, `billingCycle must be one of: ${StudentTransport.BILLING_CYCLES.join(', ')}`);
  }
  const period = await resolveInvoicePeriod(schoolId, {
    billingCycle, termId, month, year,
  });
  const candidates = await classifyTransportInvoiceCandidates(schoolId, billingCycle, period);

  const students = candidates.map(({ subscription, status, amountPesewas }) => ({
    studentTransportId: subscription.id,
    studentId: subscription.studentId,
    studentName: subscription.Student?.fullName || null,
    vehicleName: subscription.Vehicle?.name || null,
    status, // PENDING | ALREADY_INVOICED | NO_RATE
    amountPesewas: status === 'PENDING' ? amountPesewas : null,
  }));

  return {
    periodLabel: period.periodLabel,
    dueDate: period.dueDate,
    students,
    toInvoiceCount: students.filter((s) => s.status === 'PENDING').length,
    alreadyInvoicedCount: students.filter((s) => s.status === 'ALREADY_INVOICED').length,
    noRateCount: students.filter((s) => s.status === 'NO_RATE').length,
  };
}

async function generateTransportInvoices(schoolId, userId, {
  billingCycle, termId, month, year,
}) {
  if (!StudentTransport.BILLING_CYCLES.includes(billingCycle)) {
    throw new ApiError(400, `billingCycle must be one of: ${StudentTransport.BILLING_CYCLES.join(', ')}`);
  }
  const period = await resolveInvoicePeriod(schoolId, {
    billingCycle, termId, month, year,
  });
  const candidates = await classifyTransportInvoiceCandidates(schoolId, billingCycle, period);

  let invoicesCreated = 0;
  let invoicesSkipped = 0;
  let studentsWithNoRate = 0;

  for (const { subscription, status, amountPesewas } of candidates) {
    if (status === 'ALREADY_INVOICED') {
      invoicesSkipped += 1;
      continue;
    }
    if (status === 'NO_RATE') {
      studentsWithNoRate += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await sequelize.transaction(async (transaction) => {
      const invoice = await tenantScoped(TransportInvoice, schoolId).create({
        studentTransportId: subscription.id,
        studentId: subscription.studentId,
        vehicleId: subscription.vehicleId,
        billingCycle,
        termId: period.termId,
        academicYearId: period.academicYearId,
        periodMonth: period.periodMonth,
        periodYear: period.periodYear,
        periodKey: period.periodKey,
        periodLabel: period.periodLabel,
        dueDate: period.dueDate,
        amountPesewas,
        createdByUserId: userId,
      }, { transaction });
      await postTransportInvoice(schoolId, invoice, userId, transaction);
    });
    invoicesCreated += 1;
  }

  return {
    invoicesCreated, invoicesSkipped, studentsWithNoRate, periodLabel: period.periodLabel,
  };
}

// A student is in default the moment an invoice's dueDate passes without
// being paid in full — the definition the user chose over a "N consecutive
// missed periods" rule, so it's computed live here rather than stored.
function invoiceStatusFor(amountPesewas, paidPesewas, dueDate, today) {
  if (paidPesewas >= amountPesewas) return 'PAID';
  if (paidPesewas > 0) return 'PARTIAL';
  return today > dueDate ? 'DEFAULTED' : 'PENDING';
}

async function paidPesewasByInvoiceId(schoolId, invoiceIds, transaction) {
  const payments = invoiceIds.length > 0
    ? await tenantScoped(TransportPayment, schoolId).findAll({ where: { transportInvoiceId: invoiceIds }, transaction })
    : [];
  const map = new Map();
  for (const payment of payments) {
    map.set(payment.transportInvoiceId, (map.get(payment.transportInvoiceId) || 0) + payment.amountPesewas);
  }
  return map;
}

async function listTransportInvoices(schoolId, {
  studentId, vehicleId, billingCycle, status,
} = {}) {
  const where = {};
  if (studentId) where.studentId = studentId;
  if (vehicleId) where.vehicleId = vehicleId;
  if (billingCycle) where.billingCycle = billingCycle;

  const invoices = await tenantScoped(TransportInvoice, schoolId).findAll({
    where,
    include: [Student, Vehicle, Term],
    order: [['dueDate', 'DESC']],
  });

  const paidByInvoiceId = await paidPesewasByInvoiceId(schoolId, invoices.map((i) => i.id));
  const today = new Date().toISOString().slice(0, 10);

  let rows = invoices.map((invoice) => {
    const paidPesewas = paidByInvoiceId.get(invoice.id) || 0;
    return {
      ...invoice.toJSON(),
      paidPesewas,
      balancePesewas: invoice.amountPesewas - paidPesewas,
      status: invoiceStatusFor(invoice.amountPesewas, paidPesewas, invoice.dueDate, today),
    };
  });

  if (status) rows = rows.filter((r) => r.status === status);
  return rows;
}

async function deleteTransportInvoice(schoolId, invoiceId, userId) {
  const invoice = await tenantScoped(TransportInvoice, schoolId).findByPk(invoiceId);
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  assertNotSelfReversal(invoice.createdByUserId, userId);

  const paymentCount = await tenantScoped(TransportPayment, schoolId).count({ where: { transportInvoiceId: invoiceId } });
  if (paymentCount > 0) {
    throw new ApiError(400, 'This invoice has recorded payments — delete the payments first');
  }

  await sequelize.transaction(async (transaction) => {
    await reverseEntryFor(schoolId, 'TRANSPORT_INVOICE', invoice.id, { userId, reason: 'Invoice deleted' }, transaction);
    await tenantScoped(TransportInvoice, schoolId).destroy({ where: { id: invoiceId }, transaction });
  });
}

// ---- Transport billing report ----
// The "students on transport / payment status / defaulters" view — replaces
// the old Levy-based getTransportFeeReport. Optional filters narrow the
// invoice set to one period/vehicle; subscriberSummary is always unfiltered
// (a straight count of who's currently subscribed, by cycle).
async function getTransportBillingReport(schoolId, {
  billingCycle, termId, month, year, vehicleId, academicYearId,
} = {}) {
  const subscriptions = await tenantScoped(StudentTransport, schoolId).findAll({
    where: { status: ['ENROLLED', 'PENDING_PAYMENT'] },
  });
  const confirmed = subscriptions.filter((s) => s.status === 'ENROLLED');
  const subscriberSummary = {
    total: confirmed.length,
    termly: confirmed.filter((s) => s.billingCycle === 'TERMLY').length,
    monthly: confirmed.filter((s) => s.billingCycle === 'MONTHLY').length,
    awaitingPayment: subscriptions.filter((s) => s.status === 'PENDING_PAYMENT').length,
  };

  const invoiceWhere = {};
  if (vehicleId) invoiceWhere.vehicleId = vehicleId;
  if (billingCycle) invoiceWhere.billingCycle = billingCycle;
  if (academicYearId) invoiceWhere.academicYearId = academicYearId;
  if (billingCycle === 'TERMLY' && termId) invoiceWhere.termId = termId;
  if (billingCycle === 'MONTHLY' && month && year) {
    invoiceWhere.periodMonth = Number(month);
    invoiceWhere.periodYear = Number(year);
  }

  const invoices = await tenantScoped(TransportInvoice, schoolId).findAll({
    where: invoiceWhere,
    include: [Student, Vehicle, Term, AcademicYear],
    order: [['dueDate', 'DESC']],
  });

  // What was billed for the period — no paid/balance/status here by design;
  // who owes what is the Transport Debtors report's job (getTransportDebtors)
  // and a single student's running balance is the Transport Statement's
  // (getStudentTransportStatement). Mixing payment reconciliation into every
  // invoice listing was the thing this split was meant to undo.
  const rows = invoices.map((invoice) => ({
    invoiceId: invoice.id,
    student: invoice.Student,
    vehicleName: invoice.Vehicle?.name || null,
    billingCycle: invoice.billingCycle,
    periodLabel: invoice.periodLabel,
    academicYearName: invoice.AcademicYear?.name || null,
    dueDate: invoice.dueDate,
    amountPesewas: invoice.amountPesewas,
    // Not payment reconciliation data (see comment above) — just who
    // generated the invoice, so the UI can grey out "Reverse" for whoever
    // that was (assertNotSelfReversal enforces it server-side regardless).
    createdByUserId: invoice.createdByUserId,
  }));

  const summary = {
    invoicedCount: rows.length,
    totalInvoicedPesewas: rows.reduce((sum, r) => sum + r.amountPesewas, 0),
  };

  return { subscriberSummary, summary, rows };
}

// ---- Transport debtors ----
// Every student with an outstanding transport balance, aggregated across all
// their invoices — same shape as financials/service.js#getDebtors, minus the
// reminder-sending machinery (not asked for here).
async function getTransportDebtors(schoolId, { vehicleId } = {}) {
  const invoiceWhere = {};
  if (vehicleId) invoiceWhere.vehicleId = vehicleId;

  const billedRows = await tenantScoped(TransportInvoice, schoolId).findAll({
    where: invoiceWhere,
    attributes: ['studentId', [sequelize.fn('SUM', sequelize.col('amountPesewas')), 'total']],
    group: ['studentId'],
  });
  if (billedRows.length === 0) return { debtors: [], totalOutstandingPesewas: 0 };

  const studentIds = billedRows.map((r) => r.studentId);
  const invoiceIds = (await tenantScoped(TransportInvoice, schoolId).findAll({
    where: { ...invoiceWhere, studentId: studentIds },
    attributes: ['id'],
  })).map((i) => i.id);

  const paidRows = invoiceIds.length > 0
    ? await tenantScoped(TransportPayment, schoolId).findAll({
      where: { transportInvoiceId: invoiceIds },
      attributes: ['studentId', [sequelize.fn('SUM', sequelize.col('amountPesewas')), 'total']],
      group: ['studentId'],
    })
    : [];
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

  // The vehicle they're on now, for display — a debtor may owe on a vehicle
  // they've since left or been reassigned from.
  const subscriptions = await tenantScoped(StudentTransport, schoolId).findAll({
    where: { studentId: debtorIds },
    include: [Vehicle],
  });
  const vehicleByStudentId = new Map(subscriptions.map((s) => [s.studentId, s.Vehicle?.name || null]));

  const debtors = students.map((student) => ({
    student: {
      id: student.id,
      fullName: student.fullName,
      studentNumber: student.studentNumber,
      emergencyContactName: student.emergencyContactName,
      emergencyContactPhone: student.emergencyContactPhone,
    },
    vehicleName: vehicleByStudentId.get(student.id) || null,
    billedPesewas: billedByStudent.get(student.id),
    paidPesewas: paidByStudent.get(student.id) || 0,
    balancePesewas: balanceByStudent.get(student.id),
  })).sort((a, b) => b.balancePesewas - a.balancePesewas);

  return {
    debtors,
    totalOutstandingPesewas: debtors.reduce((sum, d) => sum + d.balancePesewas, 0),
  };
}

// ---- Per-student transport statement ----
// Invoices vs payments over a date range with an opening/closing running
// balance — same shape as financials/service.js#getStudentFinancialStatement.
async function getStudentTransportStatement(schoolId, studentId, { from, to } = {}) {
  const student = await tenantScoped(Student, schoolId).findByPk(studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  const invoiceWhere = { studentId };
  if (from && to) invoiceWhere.dueDate = { [Op.between]: [from, to] };
  else if (from) invoiceWhere.dueDate = { [Op.gte]: from };
  else if (to) invoiceWhere.dueDate = { [Op.lte]: to };

  const paymentWhere = { studentId };
  if (from && to) paymentWhere.paidDate = { [Op.between]: [from, to] };
  else if (from) paymentWhere.paidDate = { [Op.gte]: from };
  else if (to) paymentWhere.paidDate = { [Op.lte]: to };

  const invoices = await tenantScoped(TransportInvoice, schoolId).findAll({
    where: invoiceWhere,
    include: [Vehicle],
    order: [['dueDate', 'ASC']],
  });
  const payments = await tenantScoped(TransportPayment, schoolId).findAll({
    where: paymentWhere,
    order: [['paidDate', 'ASC']],
  });

  let openingBalancePesewas = 0;
  if (from) {
    const priorInvoices = await tenantScoped(TransportInvoice, schoolId).findAll({
      where: { studentId, dueDate: { [Op.lt]: from } },
    });
    const priorPayments = await tenantScoped(TransportPayment, schoolId).findAll({
      where: { studentId, paidDate: { [Op.lt]: from } },
    });
    openingBalancePesewas = priorInvoices.reduce((sum, i) => sum + i.amountPesewas, 0)
      - priorPayments.reduce((sum, p) => sum + p.amountPesewas, 0);
  }

  const totalInvoicedPesewas = invoices.reduce((sum, i) => sum + i.amountPesewas, 0);
  const totalPaidPesewas = payments.reduce((sum, p) => sum + p.amountPesewas, 0);

  return {
    student,
    invoices,
    payments,
    openingBalancePesewas,
    totalInvoicedPesewas,
    totalPaidPesewas,
    closingBalancePesewas: openingBalancePesewas + totalInvoicedPesewas - totalPaidPesewas,
  };
}

// ---- Transport payments ----
// Same shape as levies/service.js's payment block: sequential receipt
// number (own "TRN-" prefix/sequence), edit-with-mandatory-reason + revision
// audit trail, best-effort SMS/email receipt via financials/notify.js.

async function generateTransportReceiptNumber(schoolId) {
  const rows = await tenantScoped(TransportPayment, schoolId).findAll({ attributes: ['receiptNumber'] });
  const maxNumber = rows.reduce((max, row) => {
    const match = /^TRN-(\d+)$/.exec(row.receiptNumber);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `TRN-${String(maxNumber + 1).padStart(6, '0')}`;
}

async function createTransportPaymentWithReceipt(schoolId, values, transaction) {
  try {
    const receiptNumber = await generateTransportReceiptNumber(schoolId);
    return await tenantScoped(TransportPayment, schoolId).create({ ...values, receiptNumber }, { transaction });
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    const receiptNumber = await generateTransportReceiptNumber(schoolId);
    return tenantScoped(TransportPayment, schoolId).create({ ...values, receiptNumber }, { transaction });
  }
}

async function postTransportPayment(schoolId, payment, userId, transaction) {
  const cashAccount = await tenantScoped(CashAccount, schoolId).findByPk(payment.cashAccountId, { transaction });
  if (!cashAccount) throw new ApiError(400, 'cashAccountId does not refer to a valid cash account');

  await postJournalEntry(schoolId, {
    entryDate: payment.paidDate,
    description: `Transport fee payment received (receipt ${payment.receiptNumber})`,
    sourceType: 'TRANSPORT_PAYMENT',
    sourceId: payment.id,
    userId,
    lines: [
      { accountId: cashAccount.accountId, debitPesewas: payment.amountPesewas, studentId: payment.studentId },
      { accountCode: '1100', creditPesewas: payment.amountPesewas, studentId: payment.studentId },
    ],
  }, transaction);
}

async function computeInvoiceBalance(schoolId, invoiceId, transaction) {
  const invoice = await tenantScoped(TransportInvoice, schoolId).findByPk(invoiceId, { transaction });
  const paidByInvoiceId = await paidPesewasByInvoiceId(schoolId, [invoiceId], transaction);
  const paidPesewas = paidByInvoiceId.get(invoiceId) || 0;
  return { paidPesewas, balancePesewas: invoice.amountPesewas - paidPesewas };
}

// A payment that fully settles a PENDING_PAYMENT subscription's invoice
// confirms it — called inside the same transaction as the payment write so
// two payments racing for the same last seat can't both confirm. If the
// vehicle filled up in the meantime (another subscription confirmed first),
// the payment still stands — it's real money paying down real debt — but
// confirmation is withheld rather than silently overbooking the seat; the
// caller surfaces vehicleFull so whoever's watching can reassign the student.
async function tryConfirmSubscription(schoolId, invoiceId, transaction) {
  const invoice = await tenantScoped(TransportInvoice, schoolId).findByPk(invoiceId, { transaction });
  if (!invoice) return null;

  const subscription = await tenantScoped(StudentTransport, schoolId).findByPk(invoice.studentTransportId, { transaction });
  if (!subscription || subscription.status !== 'PENDING_PAYMENT') return null;

  const { balancePesewas } = await computeInvoiceBalance(schoolId, invoice.id, transaction);
  if (balancePesewas > 0) return null;

  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(subscription.vehicleId, { transaction });
  const enrolledCount = await tenantScoped(StudentTransport, schoolId).count({
    where: { vehicleId: subscription.vehicleId, status: 'ENROLLED' },
    transaction,
  });
  if (enrolledCount >= vehicle.capacity) {
    return { confirmed: false, vehicleFull: true, vehicleName: vehicle.name };
  }

  await subscription.update({ status: 'ENROLLED' }, { transaction });
  return { confirmed: true };
}

async function recordTransportPayment(schoolId, invoiceId, userId, {
  amountPesewas, method, paidDate, reference, notes, cashAccountId,
}) {
  const invoice = await tenantScoped(TransportInvoice, schoolId).findByPk(invoiceId);
  if (!invoice) throw new ApiError(404, 'Invoice not found');

  const student = await tenantScoped(Student, schoolId).findByPk(invoice.studentId);
  if (!student) throw new ApiError(404, 'Student not found');

  let confirmation = null;
  const payment = await sequelize.transaction(async (transaction) => {
    const created = await createTransportPaymentWithReceipt(schoolId, {
      transportInvoiceId: invoiceId,
      studentId: invoice.studentId,
      amountPesewas,
      method,
      paidDate,
      reference: reference || null,
      notes: notes || null,
      recordedByUserId: userId,
      cashAccountId,
    }, transaction);
    await postTransportPayment(schoolId, created, userId, transaction);
    confirmation = await tryConfirmSubscription(schoolId, invoiceId, transaction);
    return created;
  });

  const { balancePesewas } = await computeInvoiceBalance(schoolId, invoiceId);

  let notifications = { sms: { attempted: 0, sent: 0, failed: 0 }, email: { attempted: 0, sent: 0, failed: 0 } };
  try {
    const [school, issuer] = await Promise.all([
      School.findByPk(schoolId),
      userId ? User.findByPk(userId) : null,
    ]);
    notifications = await notifyPaymentReceipt(schoolId, {
      school,
      student: student.toJSON(),
      payment,
      balancePesewas,
      issuedByName: displayName(issuer),
      description: `Transport fee payment — ${invoice.periodLabel}`,
    });
  } catch (err) {
    notifications.error = err.message;
  }

  return {
    payment, balancePesewas, notifications, confirmation,
  };
}

async function updateTransportPayment(schoolId, transportPaymentId, userId, {
  amountPesewas, method, paidDate, reference, notes, reason, cashAccountId,
}) {
  let confirmation = null;
  await sequelize.transaction(async (transaction) => {
    const payment = await tenantScoped(TransportPayment, schoolId).findByPk(transportPaymentId, { transaction });
    if (!payment) throw new ApiError(404, 'Payment not found');

    const previousValues = {
      amountPesewas: payment.amountPesewas,
      method: payment.method,
      paidDate: payment.paidDate,
      reference: payment.reference,
      notes: payment.notes,
    };

    await reverseEntryFor(schoolId, 'TRANSPORT_PAYMENT', payment.id, { userId, reason }, transaction);

    payment.amountPesewas = amountPesewas;
    payment.method = method;
    payment.paidDate = paidDate;
    payment.reference = reference || null;
    payment.notes = notes || null;
    payment.cashAccountId = cashAccountId;
    payment.lastEditedByUserId = userId;
    await payment.save({ transaction });

    await postTransportPayment(schoolId, payment, userId, transaction);

    await tenantScoped(TransportPaymentRevision, schoolId).create({
      transportPaymentId: payment.id,
      changedByUserId: userId,
      reason,
      previousValues: JSON.stringify(previousValues),
      newValues: JSON.stringify({
        amountPesewas, method, paidDate, reference: reference || null, notes: notes || null,
      }),
    }, { transaction });

    // Editing a payment upward can complete an invoice just like a new one —
    // e.g. correcting an amount that was typed in short.
    confirmation = await tryConfirmSubscription(schoolId, payment.transportInvoiceId, transaction);
  });

  const payment = await tenantScoped(TransportPayment, schoolId).findByPk(transportPaymentId);
  const invoice = await tenantScoped(TransportInvoice, schoolId).findByPk(payment.transportInvoiceId);
  const student = await tenantScoped(Student, schoolId).findByPk(payment.studentId);
  const { balancePesewas } = await computeInvoiceBalance(schoolId, payment.transportInvoiceId);

  let notifications = { sms: { attempted: 0, sent: 0, failed: 0 }, email: { attempted: 0, sent: 0, failed: 0 } };
  try {
    const [school, editor] = await Promise.all([
      School.findByPk(schoolId),
      User.findByPk(userId),
    ]);
    notifications = await notifyPaymentReceipt(schoolId, {
      school,
      student: student.toJSON(),
      payment,
      balancePesewas,
      issuedByName: displayName(editor),
      description: `Transport fee payment — ${invoice.periodLabel}`,
    });
  } catch (err) {
    notifications.error = err.message;
  }

  return {
    payment, balancePesewas, notifications, confirmation,
  };
}

async function deleteTransportPayment(schoolId, transportPaymentId, userId) {
  return sequelize.transaction(async (transaction) => {
    const payment = await tenantScoped(TransportPayment, schoolId).findByPk(transportPaymentId, { transaction });
    if (!payment) throw new ApiError(404, 'Payment not found');
    assertNotSelfReversal(payment.recordedByUserId, userId);

    await reverseEntryFor(schoolId, 'TRANSPORT_PAYMENT', payment.id, { userId, reason: 'Payment deleted' }, transaction);
    await payment.destroy({ transaction });
  });
}

async function getTransportPaymentReceiptData(schoolId, transportPaymentId) {
  const payment = await tenantScoped(TransportPayment, schoolId).findByPk(transportPaymentId, {
    include: [
      { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'lastEditedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
  });
  if (!payment) throw new ApiError(404, 'Payment not found');

  const invoice = await tenantScoped(TransportInvoice, schoolId).findByPk(payment.transportInvoiceId);
  const student = await tenantScoped(Student, schoolId).findByPk(payment.studentId);
  const school = await School.findByPk(schoolId);
  const { balancePesewas } = await computeInvoiceBalance(schoolId, payment.transportInvoiceId);

  const issuer = payment.lastEditedBy || payment.recordedBy;

  return {
    school,
    student: student.toJSON(),
    payment,
    balancePesewas,
    issuedByName: displayName(issuer),
    description: `Transport fee payment — ${invoice.periodLabel}`,
  };
}

async function listTransportPayments(schoolId, { invoiceId, studentId } = {}) {
  const where = {};
  if (invoiceId) where.transportInvoiceId = invoiceId;
  if (studentId) where.studentId = studentId;

  const payments = await tenantScoped(TransportPayment, schoolId).findAll({
    where,
    include: [
      Student,
      { model: TransportInvoice, include: [Vehicle] },
      { model: User, as: 'recordedBy', attributes: USER_SUMMARY_ATTRIBUTES },
      { model: User, as: 'lastEditedBy', attributes: USER_SUMMARY_ATTRIBUTES },
    ],
    order: [['paidDate', 'DESC'], ['createdAt', 'DESC']],
  });

  const paymentIds = payments.map((p) => p.id);
  const revisionCounts = paymentIds.length > 0
    ? await tenantScoped(TransportPaymentRevision, schoolId).findAll({
      where: { transportPaymentId: paymentIds },
      attributes: ['transportPaymentId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['transportPaymentId'],
    })
    : [];
  const countByPaymentId = new Map(revisionCounts.map((r) => [r.transportPaymentId, Number(r.get('count'))]));

  const totalPesewas = payments.reduce((sum, p) => sum + p.amountPesewas, 0);
  return {
    payments: payments.map((p) => ({ ...p.toJSON(), revisionCount: countByPaymentId.get(p.id) || 0 })),
    totalPesewas,
  };
}

async function getTransportPaymentRevisions(schoolId, transportPaymentId) {
  const payment = await tenantScoped(TransportPayment, schoolId).findByPk(transportPaymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');

  const revisions = await tenantScoped(TransportPaymentRevision, schoolId).findAll({
    where: { transportPaymentId },
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

// ---- Parent-facing summary (one child) ----
// Combines vehicle/pickup-point assignment, today's pickup check-in, and the
// student's most recent transport invoice (if any) into one read, scoped to
// a single student — the parent portal's assertParentOwnsStudent already
// ran before this is called, so no ownership check happens here.
async function getStudentTransportSummary(schoolId, studentId) {
  const transport = await tenantScoped(StudentTransport, schoolId).findOne({
    where: { studentId, status: 'ENROLLED' },
    include: [{ model: Vehicle, include: [{ model: Staff, as: 'driver' }] }, PickupPoint],
  });

  if (!transport) {
    return {
      enrolled: false, vehicle: null, pickupPoint: null, todayPickup: null, fee: null,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = await tenantScoped(PickupRecord, schoolId).findOne({ where: { studentId, date: today } });

  // Last 10 recorded days, most recent first — enough for a parent to see
  // the pattern without needing a full history view (that's the admin
  // report, getStudentPickupHistory, for a date-range drill-down).
  const recentPickupRecords = await tenantScoped(PickupRecord, schoolId).findAll({
    where: { studentId },
    order: [['date', 'DESC']],
    limit: 10,
  });

  const latestInvoice = await tenantScoped(TransportInvoice, schoolId).findOne({
    where: { studentTransportId: transport.id },
    order: [['dueDate', 'DESC']],
  });

  let fee = null;
  if (latestInvoice) {
    const { paidPesewas, balancePesewas } = await computeInvoiceBalance(schoolId, latestInvoice.id);
    fee = {
      periodLabel: latestInvoice.periodLabel,
      dueDate: latestInvoice.dueDate,
      amountPesewas: latestInvoice.amountPesewas,
      paidPesewas,
      balancePesewas,
      status: invoiceStatusFor(latestInvoice.amountPesewas, paidPesewas, latestInvoice.dueDate, today),
    };
  }

  return {
    enrolled: true,
    vehicle: {
      name: transport.Vehicle.name,
      driverName: transport.Vehicle.driver?.fullName || null,
    },
    pickupPoint: transport.PickupPoint ? {
      name: transport.PickupPoint.name, scheduledTime: transport.PickupPoint.scheduledTime,
    } : null,
    todayPickup: todayRecord ? { status: todayRecord.status, date: todayRecord.date } : null,
    recentPickups: recentPickupRecords.map((r) => ({ date: r.date, status: r.status })),
    fee,
  };
}

// ---- Live vehicle trips (driver broadcasts location, parents watch) ----
// One VehicleTrip row per trip holds only the latest position (see the model
// comment) — this is "where is the bus right now", not a route-history
// feature. A driver is whichever Staff row a User is linked to
// (Staff.userId) that also happens to be a vehicle's driverStaffId; that's
// re-checked on every trip-control request below, never cached at login,
// same convention as assertParentOwnsStudent.

async function assertIsAssignedDriver(schoolId, userId, vehicleId) {
  const staff = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  if (!staff) throw new ApiError(403, 'No staff record is linked to this account.');

  const vehicle = await tenantScoped(Vehicle, schoolId).findByPk(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  if (vehicle.driverStaffId !== staff.id) {
    throw new ApiError(403, 'You are not the assigned driver for this vehicle.');
  }
  return { staff, vehicle };
}

// Includes each vehicle's current trip state so the driver's page can
// resume correctly after a refresh/re-login mid-trip, instead of offering
// "Start Trip" again and hitting the already-active 409 from startTrip.
async function getMyDriverVehicles(schoolId, userId) {
  const staff = await tenantScoped(Staff, schoolId).findOne({ where: { userId } });
  if (!staff) return [];

  const vehicles = await tenantScoped(Vehicle, schoolId).findAll({
    where: { driverStaffId: staff.id, status: 'ACTIVE' },
    order: [['name', 'ASC']],
  });
  if (vehicles.length === 0) return [];

  const activeTrips = await tenantScoped(VehicleTrip, schoolId).findAll({
    where: { vehicleId: vehicles.map((v) => v.id), status: 'ACTIVE' },
  });
  const activeTripByVehicleId = new Map(activeTrips.map((t) => [t.vehicleId, t]));

  return vehicles.map((vehicle) => {
    const trip = activeTripByVehicleId.get(vehicle.id);
    return {
      ...vehicle.toJSON(),
      activeTrip: trip ? { startedAt: trip.startedAt, tripType: trip.tripType } : null,
    };
  });
}

// Rejects with 409 if a trip is already active for this vehicle — enforced
// here rather than a DB constraint (see the vehicle_trips migration
// comment). Fires the "bus has set off" alert right after creating the trip,
// same call-site pattern as recordStudentDropoff firing notifyDropoff.
async function startTrip(schoolId, userId, vehicleId, tripType) {
  const resolvedTripType = tripType || 'PICKUP';
  if (!VehicleTrip.TRIP_TYPES.includes(resolvedTripType)) {
    throw new ApiError(400, `tripType must be one of: ${VehicleTrip.TRIP_TYPES.join(', ')}`);
  }

  const { staff, vehicle } = await assertIsAssignedDriver(schoolId, userId, vehicleId);

  const existingActive = await tenantScoped(VehicleTrip, schoolId).findOne({
    where: { vehicleId, status: 'ACTIVE' },
  });
  if (existingActive) throw new ApiError(409, 'A trip is already active for this vehicle.');

  const trip = await tenantScoped(VehicleTrip, schoolId).create({
    vehicleId,
    driverStaffId: staff.id,
    status: 'ACTIVE',
    tripType: resolvedTripType,
    startedAt: new Date(),
  });

  const roster = await tenantScoped(StudentTransport, schoolId).findAll({
    where: { vehicleId, status: 'ENROLLED' },
    include: [Student],
  });

  const isPickup = resolvedTripType === 'PICKUP';
  const tripLabel = isPickup ? 'is on its way to pick up students' : 'has set off to drop students home';

  let notifications = { sms: { attempted: 0, sent: 0, failed: 0 }, email: { attempted: 0, sent: 0, failed: 0 } };
  try {
    const school = await School.findByPk(schoolId);
    notifications = await notifyTripStarted(schoolId, {
      school,
      vehicle,
      driverName: staff.fullName,
      tripType: resolvedTripType,
      studentIds: roster.map((r) => r.studentId),
    });
    // In-app bell notification alongside the SMS/email above — one per
    // enrolled student, same as every other per-student fan-out in this
    // codebase (e.g. issues/service.js). A vehicle's roster is small enough
    // (dozens, not hundreds) that this loop's per-student query cost isn't a
    // real concern.
    await Promise.all(roster.map((r) => notifyParentsOfStudent(schoolId, r.studentId, {
      type: 'TRANSPORT_TRIP_STARTED',
      title: isPickup ? 'The school bus is on its way' : 'The school bus has set off',
      body: `${vehicle.name} ${tripLabel}${staff.fullName ? ` — driven by ${staff.fullName}` : ''}.`,
      linkUrl: `/parent/children/${r.studentId}/transport`,
    })));
  } catch (err) {
    notifications.error = err.message;
  }

  return { trip, notifications };
}

async function updateTripLocation(schoolId, userId, vehicleId, { latitude, longitude }) {
  await assertIsAssignedDriver(schoolId, userId, vehicleId);

  const trip = await tenantScoped(VehicleTrip, schoolId).findOne({
    where: { vehicleId, status: 'ACTIVE' },
  });
  if (!trip) throw new ApiError(404, 'No active trip for this vehicle.');

  await trip.update({
    lastLatitude: Number(latitude),
    lastLongitude: Number(longitude),
    lastPingAt: new Date(),
  });
  return trip;
}

async function endTrip(schoolId, userId, vehicleId) {
  await assertIsAssignedDriver(schoolId, userId, vehicleId);

  const trip = await tenantScoped(VehicleTrip, schoolId).findOne({
    where: { vehicleId, status: 'ACTIVE' },
  });
  if (!trip) throw new ApiError(404, 'No active trip for this vehicle.');

  await trip.update({ status: 'ENDED', endedAt: new Date() });
  return trip;
}

// Admin "Live Fleet" overview — every vehicle currently mid-trip.
async function listActiveTrips(schoolId) {
  const trips = await tenantScoped(VehicleTrip, schoolId).findAll({
    where: { status: 'ACTIVE' },
    include: [Vehicle, { model: Staff, as: 'driver' }],
    order: [['startedAt', 'ASC']],
  });

  return trips.map((trip) => ({
    vehicleId: trip.vehicleId,
    vehicleName: trip.Vehicle?.name || null,
    driverName: trip.driver?.fullName || null,
    tripType: trip.tripType,
    startedAt: trip.startedAt,
    latitude: trip.lastLatitude,
    longitude: trip.lastLongitude,
    lastPingAt: trip.lastPingAt,
  }));
}

// Parent-facing live read for one child — scoped through the student the
// parent already owns (assertParentOwnsStudent runs in parentPortal/
// service.js before this is called), so no vehicle-level authorization is
// needed here, same shape as getStudentTransportSummary above.
async function getLiveTransport(schoolId, studentId) {
  const subscription = await tenantScoped(StudentTransport, schoolId).findOne({
    where: { studentId, status: 'ENROLLED' },
    include: [{ model: Vehicle, include: [{ model: Staff, as: 'driver' }] }],
  });
  if (!subscription) return { tripActive: false };

  const trip = await tenantScoped(VehicleTrip, schoolId).findOne({
    where: { vehicleId: subscription.vehicleId, status: 'ACTIVE' },
  });
  if (!trip) return { tripActive: false };

  return {
    tripActive: true,
    tripType: trip.tripType,
    vehicle: {
      name: subscription.Vehicle.name,
      driverName: subscription.Vehicle.driver?.fullName || null,
    },
    location: {
      latitude: trip.lastLatitude,
      longitude: trip.lastLongitude,
      lastPingAt: trip.lastPingAt,
    },
  };
}

// ---- Driver-scoped pickup/drop-off recording (own vehicle only) ----
// Thin wrappers around the admin-facing pickup/drop-off functions above —
// same read/write logic, just gated by assertIsAssignedDriver instead of a
// SCHOOL_ADMIN-only route, so a driver can record their own vehicle's
// roster from the trip screen without needing separate admin access.

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

async function getMyPickupRecord(schoolId, userId, vehicleId, date) {
  await assertIsAssignedDriver(schoolId, userId, vehicleId);
  return getPickupRecord(schoolId, { vehicleId, date: date || todayDateOnly() });
}

async function saveMyPickupRecord(schoolId, userId, vehicleId, { date, records }) {
  await assertIsAssignedDriver(schoolId, userId, vehicleId);
  return savePickupRecord(schoolId, userId, { vehicleId, date: date || todayDateOnly(), records });
}

async function getMyDropoffRecord(schoolId, userId, vehicleId, date) {
  await assertIsAssignedDriver(schoolId, userId, vehicleId);
  return getDropoffRecord(schoolId, { vehicleId, date: date || todayDateOnly() });
}

async function recordMyStudentDropoff(schoolId, userId, vehicleId, { studentId, latitude, longitude, notes }) {
  await assertIsAssignedDriver(schoolId, userId, vehicleId);
  return recordStudentDropoff(schoolId, userId, {
    studentId, vehicleId, latitude, longitude, notes,
  });
}

module.exports = {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  listRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  createPickupPoint,
  updatePickupPoint,
  deletePickupPoint,
  listStudentTransport,
  assignStudentTransport,
  withdrawStudentTransport,
  deleteStudentTransport,
  sendPickupAlert,
  getPickupRecord,
  savePickupRecord,
  getStudentPickupHistory,
  getPickupReport,
  getDropoffRecord,
  recordStudentDropoff,
  getStudentDropoffHistory,
  getDropoffReport,
  getDropoffAnalytics,
  previewTransportInvoices,
  generateTransportInvoices,
  listTransportInvoices,
  deleteTransportInvoice,
  getTransportBillingReport,
  getTransportDebtors,
  getStudentTransportStatement,
  recordTransportPayment,
  updateTransportPayment,
  deleteTransportPayment,
  getTransportPaymentReceiptData,
  listTransportPayments,
  getTransportPaymentRevisions,
  getStudentTransportSummary,
  getMyDriverVehicles,
  startTrip,
  updateTripLocation,
  endTrip,
  listActiveTrips,
  getLiveTransport,
  getMyPickupRecord,
  saveMyPickupRecord,
  getMyDropoffRecord,
  recordMyStudentDropoff,
};
