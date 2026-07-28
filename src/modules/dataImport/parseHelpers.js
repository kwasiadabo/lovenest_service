const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cellToString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// Excel may hand back a real Date object for a cell the user formatted as a
// date, or a plain string if they just typed "2016-03-12" into a text cell
// — the template asks for the latter, but real-world spreadsheets aren't
// always that disciplined, so both are accepted.
function cellToDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const str = cellToString(value);
  if (!str) return null;
  if (DATE_ONLY_PATTERN.test(str)) return str;
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined; // signals "present but unparseable" vs. null ("absent")
}

// Converts the raw sheet rows (array-of-arrays, header row first — see
// read-excel-file's readSheet()) into row objects keyed by each column's
// `key` (from columns.js), skipping fully-blank rows. rowNumber matches the
// row's actual position in the spreadsheet (header is row 1) so error
// messages point at the row the admin will actually see in Excel.
function rowsToObjects(rawRows, columns) {
  if (rawRows.length === 0) return [];
  const [headerRow, ...dataRows] = rawRows;
  const headers = headerRow.map((h) => cellToString(h));
  const keyByColumnIndex = headers.map((h) => {
    const match = columns.find((c) => c.header.toLowerCase() === h.toLowerCase());
    return match ? match.key : null;
  });

  const objects = [];
  dataRows.forEach((row, idx) => {
    const isBlank = row.every((cell) => cellToString(cell) === '');
    if (isBlank) return;
    const data = {};
    keyByColumnIndex.forEach((key, i) => {
      if (key) data[key] = row[i];
    });
    objects.push({ rowNumber: idx + 2, data });
  });
  return objects;
}

// Ghanaian cedis, human-entered ("450", "450.00", "GHS 450") -> integer
// pesewas. Rejects anything that isn't a plain positive number once a
// leading currency label is stripped.
function cedisToPesewas(rawValue) {
  const str = cellToString(rawValue).replace(/^GHS\s*/i, '').replace(/,/g, '');
  if (!str) return { error: 'is required' };
  const amount = Number(str);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'must be a positive number' };
  return { value: Math.round(amount * 100) };
}

module.exports = {
  cellToString, cellToDateOnly, rowsToObjects, cedisToPesewas,
};
