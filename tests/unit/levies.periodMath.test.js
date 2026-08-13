const {
  periodsElapsed, applyFrequency, paidPesewasAsOf, resolvePeriodBoundary,
} = require('../../src/modules/levies/service');

describe('levies/service.js period math (pure helpers)', () => {
  describe('periodsElapsed', () => {
    // schoolId is irrelevant for every branch below except TERMLY, which
    // isn't exercised here (it needs a real Term row).
    const schoolId = 'unused';

    test('ONE_TIME always returns 0 (unused by that frequency)', async () => {
      const levy = { frequency: 'ONE_TIME', startDate: '2026-07-01' };
      await expect(periodsElapsed(schoolId, levy, '2026-08-01')).resolves.toBe(0);
    });

    test('no startDate returns 0', async () => {
      const levy = { frequency: 'DAILY', startDate: null };
      await expect(periodsElapsed(schoolId, levy, '2026-08-01')).resolves.toBe(0);
    });

    test('asOfDate before startDate returns 0', async () => {
      const levy = { frequency: 'DAILY', startDate: '2026-08-01' };
      await expect(periodsElapsed(schoolId, levy, '2026-07-29')).resolves.toBe(0);
    });

    test('DAILY: same day as startDate is period 1', async () => {
      const levy = { frequency: 'DAILY', startDate: '2026-07-29' };
      await expect(periodsElapsed(schoolId, levy, '2026-07-29')).resolves.toBe(1);
    });

    test('DAILY: 3 days after startDate is period 4 (inclusive)', async () => {
      const levy = { frequency: 'DAILY', startDate: '2026-07-29' };
      await expect(periodsElapsed(schoolId, levy, '2026-08-01')).resolves.toBe(4);
    });

    test('WEEKLY: 6 days after startDate is still period 1', async () => {
      const levy = { frequency: 'WEEKLY', startDate: '2026-07-01' };
      await expect(periodsElapsed(schoolId, levy, '2026-07-07')).resolves.toBe(1);
    });

    test('WEEKLY: exactly 7 days after startDate is period 2', async () => {
      const levy = { frequency: 'WEEKLY', startDate: '2026-07-01' };
      await expect(periodsElapsed(schoolId, levy, '2026-07-08')).resolves.toBe(2);
    });

    test('MONTHLY: same calendar month is period 1', async () => {
      const levy = { frequency: 'MONTHLY', startDate: '2026-07-05' };
      await expect(periodsElapsed(schoolId, levy, '2026-07-29')).resolves.toBe(1);
    });

    test('MONTHLY: next calendar month is period 2, regardless of day-of-month', async () => {
      const levy = { frequency: 'MONTHLY', startDate: '2026-07-31' };
      await expect(periodsElapsed(schoolId, levy, '2026-08-01')).resolves.toBe(2);
    });
  });

  describe('applyFrequency', () => {
    test('ONE_TIME passes the base amount through unchanged, ignoring periods', () => {
      expect(applyFrequency({ frequency: 'ONE_TIME' }, 5000, 30)).toBe(5000);
    });

    test('recurring frequencies multiply base amount by periods elapsed', () => {
      expect(applyFrequency({ frequency: 'DAILY' }, 500, 4)).toBe(2000);
    });

    test('an undefined base amount (out of scope) stays undefined', () => {
      expect(applyFrequency({ frequency: 'DAILY' }, undefined, 4)).toBeUndefined();
    });
  });

  describe('paidPesewasAsOf', () => {
    const payments = [
      { amountPesewas: 500, paidDate: '2026-07-29' },
      { amountPesewas: 300, paidDate: '2026-08-05' },
    ];

    test('ONE_TIME sums every payment unconditionally, even ones dated after asOfDate', () => {
      const levy = { frequency: 'ONE_TIME' };
      expect(paidPesewasAsOf(payments, levy, '2026-07-30')).toBe(800);
    });

    test('recurring levies exclude payments dated after asOfDate', () => {
      const levy = { frequency: 'DAILY' };
      expect(paidPesewasAsOf(payments, levy, '2026-07-30')).toBe(500);
    });

    test('recurring levies include everything once asOfDate covers all payments', () => {
      const levy = { frequency: 'DAILY' };
      expect(paidPesewasAsOf(payments, levy, '2026-08-05')).toBe(800);
    });
  });

  describe('resolvePeriodBoundary', () => {
    test('TERMLY uses the given term\'s own start/end dates', () => {
      const levy = { frequency: 'TERMLY' };
      const term = { startDate: '2026-09-01', endDate: '2026-12-15' };
      expect(resolvePeriodBoundary(levy, '2026-10-01', term)).toEqual({
        periodStart: '2026-09-01', periodEnd: '2026-12-15',
      });
    });

    test('DAILY: the period is just that single day', () => {
      const levy = { frequency: 'DAILY', startDate: '2026-07-01' };
      expect(resolvePeriodBoundary(levy, '2026-07-29', null)).toEqual({
        periodStart: '2026-07-29', periodEnd: '2026-07-29',
      });
    });

    test('ONE_TIME: the period spans the whole levy lifetime (startDate to asOfDate)', () => {
      const levy = { frequency: 'ONE_TIME', startDate: '2026-07-01' };
      expect(resolvePeriodBoundary(levy, '2026-07-29', null)).toEqual({
        periodStart: '2026-07-01', periodEnd: '2026-07-29',
      });
    });

    test('WEEKLY: resolves to the Monday-Sunday window containing asOfDate', () => {
      const levy = { frequency: 'WEEKLY', startDate: '2026-07-01' };
      // 2026-07-29 is a Wednesday.
      expect(resolvePeriodBoundary(levy, '2026-07-29', null)).toEqual({
        periodStart: '2026-07-27', periodEnd: '2026-08-02',
      });
    });

    test('MONTHLY: resolves to the full calendar month containing asOfDate', () => {
      const levy = { frequency: 'MONTHLY', startDate: '2026-07-01' };
      expect(resolvePeriodBoundary(levy, '2026-07-29', null)).toEqual({
        periodStart: '2026-07-01', periodEnd: '2026-07-31',
      });
    });
  });
});
