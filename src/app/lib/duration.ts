const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** '15m' | '7d' | '12h' | '30s' to milliseconds. */
export const parseDuration = (value: string): number => {
  const m = value.trim().match(/^(\d+)\s*([smhd])$/);
  if (!m) throw new Error(`Invalid duration: ${value}`);
  return Number(m[1]) * UNITS[m[2]];
};
