import { describe, expect, it } from 'vitest';
import { clampDiscount, percentOf, sumMoney, assertMoney } from '../src/app/lib/money';
import { addDays, dayOfWeek, isValidLocalDate, toLocalDate } from '../src/app/lib/localDate';

describe('money', () => {
  it('rounds percent discounts half up to the nearest poisha', () => {
    expect(percentOf(1000, 12.5)).toBe(125);
    expect(percentOf(1001, 50)).toBe(501); // 500.5 -> 501
    expect(percentOf(333, 33.33)).toBe(111);
  });
  it('never lets a discount go negative or above the amount', () => {
    expect(clampDiscount(500, 900)).toBe(500);
    expect(clampDiscount(500, -5)).toBe(0);
  });
  it('rejects floats and negatives', () => {
    expect(() => assertMoney(10.5)).toThrow();
    expect(() => assertMoney(-1)).toThrow();
    expect(sumMoney([100, 250])).toBe(350);
  });
});

describe('localDate (Asia/Dhaka)', () => {
  it('converts a UTC late evening to the next Dhaka day', () => {
    expect(toLocalDate(new Date('2026-03-10T20:00:00Z'))).toBe('2026-03-11');
    expect(toLocalDate(new Date('2026-03-10T17:59:00Z'))).toBe('2026-03-10');
  });
  it('validates dates and finds weekdays', () => {
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('2026-02-28')).toBe(true);
    expect(dayOfWeek('2026-03-13')).toBe(5); // Friday
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});
