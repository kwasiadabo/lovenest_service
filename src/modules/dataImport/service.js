const { readSheet } = require('read-excel-file/node');
const writeXlsx = require('write-excel-file/node').default;
const { parse: parseCsv } = require('csv-parse/sync');
const {
  ImportBatch, Student, Class, Level, AcademicYear, Term, Vehicle, Route, PickupPoint,
  FeeType, Bill, BillItem,
} = require('../../models');
const tenantScoped = require('../../utils/tenantScopedModel');
const ApiError = require('../../utils/ApiError');
const { COLUMNS_BY_TYPE } = require('./columns');
const { rowsToObjects, cellToString } = require('./parseHelpers');
const { parseStudentRow } = require('./parsers/students');
const { parseFeeBalanceRow } = require('./parsers/feeBalances');
const { parseTransportSubscriberRow } = require('./parsers/transportSubscribers');
const studentsService = require('../students/service');
const transportService = require('../transport/service');
const financialsService = require('../financials/service');

const MAX_ROWS = 2000;
const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv']);

// ---- Template generation ----

async function generateTemplate(type) {
  const columns = COLUMNS_BY_TYPE[type];
  if (!columns) throw new ApiError(400, `Unknown import type: ${type}`);

  const data = [
    columns.map((c) => ({ value: c.header, fontWeight: 'bold', backgroundColor: '#EEEEEE' })),
    columns.map((c) => ({ value: c.example || '' })),
  ];
  const columnWidths = columns.map((c) => ({ width: Math.max(18, c.header.length) }));
  return writeXlsx(data, { columns: columnWidths }).toBuffer();
}

// ---- Parsing (buffer -> raw rows-of-arrays, shared by both file types) ----

async function parseFileToRawRows(fileBuffer, mimetype) {
  if (CSV_MIME_TYPES.has(mimetype)) {
    return parseCsv(fileBuffer.toString('utf8'), { skip_empty_lines: true, trim: true });
  }
  const sheets = await readSheet(fileBuffer);
  return sheets || [];
}

// ---- Context builders (one query batch per file, not per row) ----

async function buildStudentIndex(schoolId) {
  const students = await tenantScoped(Student, schoolId).findAll();
  const byNumber = new Map();
  const byNameDob = new Map();
  students.forEach((s) => {
    byNumber.set(s.studentNumber.toUpperCase(), s);
    const key = `${s.firstName.toLowerCase()}|${s.lastName.toLowerCase()}|${s.dateOfBirth}`;
    if (!byNameDob.has(key)) byNameDob.set(key, []);
    byNameDob.get(key).push(s);
  });
  return { byNumber, byNameDob };
}

async function getCurrentAcademicYear(schoolId) {
  const year = await tenantScoped(AcademicYear, schoolId).findOne({ where: { isCurrent: true } });
  if (!year) throw new ApiError(400, 'No current academic year is set. Set one under Academic Years first.');
  return year;
}

async function getCurrentTerm(schoolId, academicYearId) {
  const term = await tenantScoped(Term, schoolId).findOne({ where: { academicYearId, isCurrent: true } });
  if (!term) throw new ApiError(400, 'No current term is set. Set one under Academic Years first.');
  return term;
}

async function buildContext(schoolId, type) {
  if (type === 'STUDENTS') {
    const year = await getCurrentAcademicYear(schoolId);
    const classes = await tenantScoped(Class, schoolId).findAll({ where: {}, include: [Level] });
    const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c]));
    return { classByName, academicYearId: year.id };
  }

  if (type === 'FEE_BALANCES') {
    const studentIndex = await buildStudentIndex(schoolId);
    const year = await getCurrentAcademicYear(schoolId);
    const term = await getCurrentTerm(schoolId, year.id);
    const existingBills = await tenantScoped(Bill, schoolId).findAll({ where: { termId: term.id } });
    return {
      studentIndex,
      academicYearId: year.id,
      termId: term.id,
      existingBillStudentIds: new Set(existingBills.map((b) => b.studentId)),
    };
  }

  if (type === 'TRANSPORT_SUBSCRIBERS') {
    const studentIndex = await buildStudentIndex(schoolId);
    const vehicles = await tenantScoped(Vehicle, schoolId).findAll();
    const vehicleByName = new Map(vehicles.map((v) => [v.name.toLowerCase(), v]));
    const routes = await tenantScoped(Route, schoolId).findAll();
    const routeIdsByVehicleId = new Map();
    routes.forEach((r) => {
      if (!routeIdsByVehicleId.has(r.vehicleId)) routeIdsByVehicleId.set(r.vehicleId, []);
      routeIdsByVehicleId.get(r.vehicleId).push(r.id);
    });
    const points = await tenantScoped(PickupPoint, schoolId).findAll();
    const pickupPointsByVehicleId = new Map();
    vehicles.forEach((v) => {
      const routeIds = new Set(routeIdsByVehicleId.get(v.id) || []);
      const map = new Map();
      points.filter((p) => routeIds.has(p.routeId)).forEach((p) => map.set(p.name.toLowerCase(), p));
      pickupPointsByVehicleId.set(v.id, map);
    });
    return { studentIndex, vehicleByName, pickupPointsByVehicleId };
  }

  throw new ApiError(400, `Unknown import type: ${type}`);
}

// Human-readable identifier for a row in the preview/confirm report — built
// from the raw uploaded values regardless of whether the row parsed
// successfully, so an error row still shows the admin *which* row it is.
function rowLabel(rawData) {
  const studentNumber = cellToString(rawData.studentNumber);
  const name = [cellToString(rawData.firstName), cellToString(rawData.lastName)].filter(Boolean).join(' ');
  if (studentNumber && name) return `${name} (${studentNumber})`;
  return studentNumber || name || '(no name given)';
}

const PARSERS_BY_TYPE = {
  STUDENTS: parseStudentRow,
  FEE_BALANCES: parseFeeBalanceRow,
  TRANSPORT_SUBSCRIBERS: parseTransportSubscriberRow,
};

// ---- Preview ----

async function previewImport(schoolId, userId, type, fileBuffer, fileName, mimetype) {
  const columns = COLUMNS_BY_TYPE[type];
  if (!columns) throw new ApiError(400, `Unknown import type: ${type}`);

  const rawRows = await parseFileToRawRows(fileBuffer, mimetype);
  if (rawRows.length <= 1) throw new ApiError(400, 'The file has no data rows');

  const objects = rowsToObjects(rawRows, columns);
  if (objects.length > MAX_ROWS) throw new ApiError(400, `A single import is limited to ${MAX_ROWS} rows (found ${objects.length})`);

  const context = await buildContext(schoolId, type);
  const parseRow = PARSERS_BY_TYPE[type];

  const rows = objects.map(({ rowNumber, data: rawData }) => {
    const { data, errors } = parseRow(rawData, context);
    return {
      rowNumber, label: rowLabel(rawData), data: data || null, errors: errors || [],
    };
  });

  const validRowCount = rows.filter((r) => r.errors.length === 0).length;
  const errorRowCount = rows.length - validRowCount;

  const batch = await tenantScoped(ImportBatch, schoolId).create({
    type,
    status: 'PENDING',
    fileName,
    totalRows: rows.length,
    validRowCount,
    errorRowCount,
    rowsJson: JSON.stringify(rows),
    createdByUserId: userId,
  });

  return {
    importBatchId: batch.id, type, totalRows: rows.length, validRowCount, errorRowCount, rows,
  };
}

// ---- Confirm ----

async function commitStudentRow(schoolId, userId, data) {
  const { classId, ...studentData } = data;
  const student = await studentsService.createStudent(schoolId, studentData, undefined);
  if (classId) {
    await studentsService.assignStudentToClass(schoolId, { studentId: student.id, classId });
  }
  return student.id;
}

async function commitFeeBalanceRow(schoolId, userId, data, context) {
  let feeType = await tenantScoped(FeeType, schoolId).findOne({ where: { name: 'Opening Balance' } });
  if (!feeType) {
    feeType = await tenantScoped(FeeType, schoolId).create({ name: 'Opening Balance', category: 'OTHER' });
  }

  const bill = await tenantScoped(Bill, schoolId).create({
    studentId: data.studentId,
    academicYearId: context.academicYearId,
    termId: context.termId,
    totalPesewas: data.balancePesewas,
  });
  await tenantScoped(BillItem, schoolId).create({
    billId: bill.id, feeTypeId: feeType.id, amountPesewas: data.balancePesewas, source: 'STANDARD',
  });
  await financialsService.confirmBill(schoolId, bill.id, userId);
  return bill.id;
}

async function commitTransportSubscriberRow(schoolId, userId, data) {
  const record = await transportService.assignStudentTransport(schoolId, userId, data);
  return record.id;
}

const COMMITTERS_BY_TYPE = {
  STUDENTS: (schoolId, userId, data) => commitStudentRow(schoolId, userId, data),
  FEE_BALANCES: (schoolId, userId, data, context) => commitFeeBalanceRow(schoolId, userId, data, context),
  TRANSPORT_SUBSCRIBERS: (schoolId, userId, data) => commitTransportSubscriberRow(schoolId, userId, data),
};

// Commits row-by-row rather than in one transaction — a single bad row (e.g.
// a duplicate created since preview) shouldn't roll back an otherwise-good
// import of hundreds of rows. Each row's outcome is recorded back onto the
// batch for the confirmation report.
async function confirmImport(schoolId, userId, importBatchId) {
  const batch = await tenantScoped(ImportBatch, schoolId).findByPk(importBatchId);
  if (!batch) throw new ApiError(404, 'Import batch not found');
  if (batch.status !== 'PENDING') throw new ApiError(400, `This import is already ${batch.status.toLowerCase()}`);

  const rows = JSON.parse(batch.rowsJson);
  const commit = COMMITTERS_BY_TYPE[batch.type];
  const context = batch.type === 'FEE_BALANCES' ? await buildContext(schoolId, batch.type) : null;

  let committedCount = 0;
  let failedCount = 0;
  for (const row of rows) {
    if (row.errors.length > 0) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await commit(schoolId, userId, row.data, context);
      row.outcome = 'COMMITTED';
      committedCount += 1;
    } catch (err) {
      row.outcome = 'FAILED';
      row.commitError = err instanceof ApiError ? err.message : 'Could not import this row';
      failedCount += 1;
    }
  }

  await tenantScoped(ImportBatch, schoolId).update(
    {
      status: 'CONFIRMED',
      confirmedByUserId: userId,
      confirmedAt: new Date(),
      rowsJson: JSON.stringify(rows),
    },
    { where: { id: batch.id } },
  );

  return {
    importBatchId: batch.id, committedCount, failedCount, rows,
  };
}

async function cancelImport(schoolId, importBatchId) {
  const batch = await tenantScoped(ImportBatch, schoolId).findByPk(importBatchId);
  if (!batch) throw new ApiError(404, 'Import batch not found');
  if (batch.status !== 'PENDING') throw new ApiError(400, `This import is already ${batch.status.toLowerCase()}`);
  await tenantScoped(ImportBatch, schoolId).update({ status: 'CANCELLED' }, { where: { id: batch.id } });
}

async function listImportBatches(schoolId) {
  const batches = await tenantScoped(ImportBatch, schoolId).findAll({ order: [['createdAt', 'DESC']] });
  return batches.map((b) => ({
    id: b.id,
    type: b.type,
    status: b.status,
    fileName: b.fileName,
    totalRows: b.totalRows,
    validRowCount: b.validRowCount,
    errorRowCount: b.errorRowCount,
    createdAt: b.createdAt,
    confirmedAt: b.confirmedAt,
  }));
}

async function getImportBatch(schoolId, importBatchId) {
  const batch = await tenantScoped(ImportBatch, schoolId).findByPk(importBatchId);
  if (!batch) throw new ApiError(404, 'Import batch not found');
  return { ...batch.toJSON(), rows: JSON.parse(batch.rowsJson) };
}

module.exports = {
  generateTemplate, previewImport, confirmImport, cancelImport, listImportBatches, getImportBatch,
};
