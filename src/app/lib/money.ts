/** Money is an integer number of poisha (1 BDT = 100 poisha). Never a float. */
export type Money = number;

export const assertMoney = (value: unknown, label = 'amount'): Money => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer (poisha)`);
  }
  return value;
};

export const sumMoney = (values: Money[]): Money => values.reduce((a, b) => a + b, 0);

/** percent of an amount, rounded half up to the nearest poisha. percent in 0..100 (decimals allowed). */
export const percentOf = (amount: Money, percent: number): Money => {
  if (percent < 0 || percent > 100) throw new Error('percent must be between 0 and 100');
  return Math.floor((amount * percent) / 100 + 0.5);
};

/** Discount never exceeds the amount and never goes negative. */
export const clampDiscount = (amount: Money, discount: Money): Money =>
  Math.max(0, Math.min(amount, discount));

export const takaToPoisha = (taka: number): Money => Math.round(taka * 100);
export const poishaToTaka = (poisha: Money): number => poisha / 100;
