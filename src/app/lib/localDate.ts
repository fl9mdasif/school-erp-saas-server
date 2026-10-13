/** Business dates are 'YYYY-MM-DD' strings in Asia/Dhaka (UTC+6, no DST). Timestamps stay in UTC. */
export type LocalDate = string;

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const RE = /^\d{4}-\d{2}-\d{2}$/;

export const isValidLocalDate = (s: unknown): s is LocalDate => {
  if (typeof s !== 'string' || !RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const toLocalDate = (d: Date = new Date()): LocalDate =>
  new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

export const todayLocal = (): LocalDate => toLocalDate(new Date());

/** 0 = Sunday ... 5 = Friday, 6 = Saturday */
export const dayOfWeek = (s: LocalDate): number => new Date(`${s}T00:00:00.000Z`).getUTCDay();

export const isFuture = (s: LocalDate): boolean => s > todayLocal();

export const addDays = (s: LocalDate, days: number): LocalDate => {
  const d = new Date(`${s}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const monthOf = (s: LocalDate): string => s.slice(0, 7);

/** Start of a local date as a UTC instant. */
export const localDateStart = (s: LocalDate): Date =>
  new Date(new Date(`${s}T00:00:00.000Z`).getTime() - DHAKA_OFFSET_MS);
export const localDateEnd = (s: LocalDate): Date =>
  new Date(localDateStart(s).getTime() + 24 * 3600 * 1000 - 1);
