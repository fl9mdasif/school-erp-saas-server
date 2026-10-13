type Band = { minPercent: number; maxPercent: number; letter: string; point?: number; remark?: string };

export const GPA5_BANDS: Band[] = [
  { minPercent: 80, maxPercent: 100, letter: 'A+', point: 5 },
  { minPercent: 70, maxPercent: 79, letter: 'A', point: 4 },
  { minPercent: 60, maxPercent: 69, letter: 'A-', point: 3.5 },
  { minPercent: 50, maxPercent: 59, letter: 'B', point: 3 },
  { minPercent: 40, maxPercent: 49, letter: 'C', point: 2 },
  { minPercent: 33, maxPercent: 39, letter: 'D', point: 1 },
  { minPercent: 0, maxPercent: 32, letter: 'F', point: 0 },
];

// Madrasa division names need review by someone who runs a madrasa before launch to that segment.
export const DIVISION_BANDS: Band[] = [
  { minPercent: 80, maxPercent: 100, letter: 'Mumtaz', remark: 'Excellent' },
  { minPercent: 65, maxPercent: 79, letter: 'Jayyid Jiddan', remark: 'Very good' },
  { minPercent: 50, maxPercent: 64, letter: 'Jayyid', remark: 'Good' },
  { minPercent: 33, maxPercent: 49, letter: 'Maqbul', remark: 'Pass' },
  { minPercent: 0, maxPercent: 32, letter: 'Rasib', remark: 'Fail' },
];

export const PERCENTAGE_BANDS: Band[] = [
  { minPercent: 80, maxPercent: 100, letter: 'A+' },
  { minPercent: 70, maxPercent: 79, letter: 'A' },
  { minPercent: 60, maxPercent: 69, letter: 'B' },
  { minPercent: 50, maxPercent: 59, letter: 'C' },
  { minPercent: 33, maxPercent: 49, letter: 'D' },
  { minPercent: 0, maxPercent: 32, letter: 'F' },
];

export const gradingPresetFor = (preset: 'gpa5' | 'division' | 'percentage') => {
  if (preset === 'gpa5') return { name: 'GPA 5.00', kind: 'gpa' as const, bands: GPA5_BANDS };
  if (preset === 'division') return { name: 'Division', kind: 'division' as const, bands: DIVISION_BANDS };
  return { name: 'Percentage', kind: 'percentage' as const, bands: PERCENTAGE_BANDS };
};
