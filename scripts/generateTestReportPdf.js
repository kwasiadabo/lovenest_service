// Reads Jest's (backend unit+integration) and Playwright's (frontend e2e)
// JSON reporter output and renders one combined PDF summarizing pass/fail
// results across all three test types. Reuses the color/typography
// constants already established in utils/receiptPdf.js for visual
// consistency with the rest of this codebase's PDF output.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  INK, MUTED, BORDER, ACCENT,
} = require('../src/utils/receiptPdf');

const PASS_COLOR = '#15803d';
const FAIL_COLOR = '#b91c1c';

const JEST_RESULTS_PATH = path.resolve(__dirname, '../test-results/jest-results.json');
const PLAYWRIGHT_RESULTS_PATH = path.resolve(__dirname, '../../frontend/test-results/playwright-results.json');
const OUTPUT_PATH = path.resolve(__dirname, '../test-results/vx-school-test-report.pdf');

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN_X = 40;
const CONTENT_WIDTH = PAGE.width - MARGIN_X * 2;

function formatDuration(ms) {
  if (ms === undefined || ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

// --- Jest (unit + integration) -------------------------------------------

function loadJestTests() {
  if (!fs.existsSync(JEST_RESULTS_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(JEST_RESULTS_PATH, 'utf8'));

  const tests = [];
  for (const fileResult of data.testResults) {
    const relativePath = path.relative(path.resolve(__dirname, '..'), fileResult.name);
    const suiteType = relativePath.includes(`tests${path.sep}unit${path.sep}`) ? 'Unit' : 'Integration';
    const fileName = path.basename(fileResult.name);

    for (const assertion of fileResult.assertionResults) {
      tests.push({
        suiteType,
        fileName,
        testName: [...assertion.ancestorTitles, assertion.title].filter(Boolean).join(' › '),
        status: assertion.status === 'passed' ? 'passed' : assertion.status === 'pending' ? 'skipped' : 'failed',
        durationMs: assertion.duration,
      });
    }
  }
  return tests;
}

// --- Playwright (e2e) ------------------------------------------------------

function loadPlaywrightTests() {
  if (!fs.existsSync(PLAYWRIGHT_RESULTS_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(PLAYWRIGHT_RESULTS_PATH, 'utf8'));

  const tests = [];
  // Playwright's suite tree can nest (a spec file's suite may itself
  // contain sub-suites for each describe block) — walk recursively rather
  // than assuming a fixed depth.
  function walkSuite(suite, fileName) {
    const thisFile = suite.file ? path.basename(suite.file) : fileName;
    for (const spec of suite.specs || []) {
      const result = spec.tests?.[0]?.results?.[0];
      tests.push({
        suiteType: 'E2E',
        fileName: thisFile,
        testName: spec.title,
        status: spec.ok ? 'passed' : 'failed',
        durationMs: result?.duration,
      });
    }
    for (const child of suite.suites || []) {
      walkSuite(child, thisFile);
    }
  }

  for (const suite of data.suites || []) {
    walkSuite(suite, path.basename(suite.file || ''));
  }
  return tests;
}

// --- PDF rendering -----------------------------------------------------

function drawHeader(doc, generatedAt) {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text('VX-School Test Report', MARGIN_X, 50);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED)
    .text(`Generated ${generatedAt}`, MARGIN_X, 76);
  doc.moveTo(MARGIN_X, 100).lineTo(PAGE.width - MARGIN_X, 100).strokeColor(BORDER).stroke();
  return 120;
}

function summarize(tests) {
  return {
    total: tests.length,
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => t.status === 'failed').length,
    skipped: tests.filter((t) => t.status === 'skipped').length,
  };
}

function drawSummaryTable(doc, y, rows) {
  const cols = [
    { label: 'Suite', width: 140 },
    { label: 'Total', width: 100 },
    { label: 'Passed', width: 100 },
    { label: 'Failed', width: 100 },
    { label: 'Skipped', width: 95 },
  ];

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
  doc.rect(MARGIN_X, y, CONTENT_WIDTH, 24).fill(ACCENT);
  let x = MARGIN_X + 10;
  doc.fillColor('#ffffff');
  cols.forEach((col) => {
    doc.text(col.label, x, y + 7, { width: col.width - 10 });
    x += col.width;
  });
  y += 24;

  doc.font('Helvetica').fontSize(9.5);
  rows.forEach((row, i) => {
    if (i % 2 === 1) {
      doc.rect(MARGIN_X, y, CONTENT_WIDTH, 22).fill('#f8fafc');
    }
    x = MARGIN_X + 10;
    const values = [row.label, String(row.total), String(row.passed), String(row.failed), String(row.skipped)];
    values.forEach((value, colIndex) => {
      const isFailedCol = colIndex === 3 && row.failed > 0;
      doc.fillColor(isFailedCol ? FAIL_COLOR : INK).text(value, x, y + 6, { width: cols[colIndex].width - 10 });
      x += cols[colIndex].width;
    });
    y += 22;
  });

  doc.strokeColor(BORDER).lineWidth(1).rect(MARGIN_X, y - rows.length * 22 - 24, CONTENT_WIDTH, rows.length * 22 + 24).stroke();
  return y + 20;
}

function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE.height - 60) {
    doc.addPage();
    return 50;
  }
  return y;
}

function drawTestTable(doc, y, title, tests) {
  y = ensureSpace(doc, y, 60);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(title, MARGIN_X, y);
  y += 20;

  if (tests.length === 0) {
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('No tests found.', MARGIN_X, y);
    return y + 20;
  }

  const cols = [
    { label: 'File', width: 110 },
    { label: 'Test', width: 300 },
    { label: 'Status', width: 55 },
    { label: 'Duration', width: 50 },
  ];
  const ROW_FONT_SIZE = 8.5;
  const ROW_V_PAD = 6;
  const MAX_TEST_NAME_LINES = 3;

  const drawHead = (headY) => {
    doc.font('Helvetica-Bold').fontSize(ROW_FONT_SIZE).fillColor('#ffffff');
    doc.rect(MARGIN_X, headY, CONTENT_WIDTH, 20).fill(ACCENT);
    let x = MARGIN_X + 8;
    doc.fillColor('#ffffff');
    cols.forEach((col) => {
      doc.text(col.label, x, headY + 6, { width: col.width - 8 });
      x += col.width;
    });
    return headY + 20;
  };

  y = drawHead(y);

  doc.font('Helvetica').fontSize(ROW_FONT_SIZE);
  tests.forEach((test, i) => {
    // Test descriptions are full ancestor-chained strings (can be long and
    // genuinely informative, e.g. "describe › nested describe › it") —
    // wrap up to a few lines rather than truncating to one, but still cap
    // it so one runaway string can't blow out the page.
    const testNameHeight = doc.heightOfString(test.testName, {
      width: cols[1].width - 8, lineGap: 1,
    });
    const maxHeight = ROW_FONT_SIZE * 1.2 * MAX_TEST_NAME_LINES;
    const rowHeight = Math.max(20, Math.min(testNameHeight, maxHeight) + ROW_V_PAD * 2 - 6);

    y = ensureSpace(doc, y, rowHeight);
    if (y === 50) y = drawHead(y); // re-drew header after a page break

    if (i % 2 === 1) doc.rect(MARGIN_X, y, CONTENT_WIDTH, rowHeight).fill('#f8fafc');

    let x = MARGIN_X + 8;
    doc.fillColor(INK).text(test.fileName, x, y + ROW_V_PAD, {
      width: cols[0].width - 8, height: rowHeight - ROW_V_PAD, ellipsis: true,
    });
    x += cols[0].width;
    doc.fillColor(INK).text(test.testName, x, y + ROW_V_PAD, {
      width: cols[1].width - 8, height: maxHeight, ellipsis: true, lineGap: 1,
    });
    x += cols[1].width;
    doc.fillColor(test.status === 'passed' ? PASS_COLOR : test.status === 'skipped' ? MUTED : FAIL_COLOR)
      .font('Helvetica-Bold')
      .text(test.status === 'passed' ? 'PASS' : test.status === 'skipped' ? 'SKIP' : 'FAIL', x, y + ROW_V_PAD, { width: cols[2].width - 8 });
    doc.font('Helvetica');
    x += cols[2].width;
    doc.fillColor(MUTED).text(formatDuration(test.durationMs), x, y + ROW_V_PAD, { width: cols[3].width - 8 });

    y += rowHeight;
  });

  doc.strokeColor(BORDER).lineWidth(0.5);
  return y + 15;
}

function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  const jestTests = loadJestTests();
  const playwrightTests = loadPlaywrightTests();
  const unitTests = jestTests.filter((t) => t.suiteType === 'Unit');
  const integrationTests = jestTests.filter((t) => t.suiteType === 'Integration');
  const e2eTests = playwrightTests;
  const allTests = [...unitTests, ...integrationTests, ...e2eTests];

  const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0, bufferPages: true });
  doc.pipe(fs.createWriteStream(OUTPUT_PATH));

  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  let y = drawHeader(doc, generatedAt);

  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text('Summary', MARGIN_X, y);
  y += 22;

  const overall = summarize(allTests);
  const summaryRows = [
    { label: 'Unit', ...summarize(unitTests) },
    { label: 'Integration', ...summarize(integrationTests) },
    { label: 'E2E', ...summarize(e2eTests) },
    { label: 'Total', ...overall },
  ];
  y = drawSummaryTable(doc, y, summaryRows);

  const overallStatus = overall.failed === 0 ? 'ALL TESTS PASSED' : `${overall.failed} TEST(S) FAILED`;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(overall.failed === 0 ? PASS_COLOR : FAIL_COLOR)
    .text(overallStatus, MARGIN_X, y);
  y += 30;

  y = drawTestTable(doc, y, 'Unit Tests', unitTests);
  y = drawTestTable(doc, y, 'Integration Tests', integrationTests);
  drawTestTable(doc, y, 'End-to-End Tests', e2eTests);

  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(`Page ${i + 1} of ${pageCount}`, MARGIN_X, PAGE.height - 30, { width: CONTENT_WIDTH, align: 'right' });
  }

  doc.end();

  // eslint-disable-next-line no-console
  console.log(`Test report written to ${OUTPUT_PATH}`);
  // eslint-disable-next-line no-console
  console.log(`Unit: ${summaryRows[0].passed}/${summaryRows[0].total} passed`);
  // eslint-disable-next-line no-console
  console.log(`Integration: ${summaryRows[1].passed}/${summaryRows[1].total} passed`);
  // eslint-disable-next-line no-console
  console.log(`E2E: ${summaryRows[2].passed}/${summaryRows[2].total} passed`);
  // eslint-disable-next-line no-console
  console.log(`Overall: ${overall.passed}/${overall.total} passed`);
}

main();
