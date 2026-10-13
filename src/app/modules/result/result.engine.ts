/**
 * Pure result engine: no database, no clock. Every rule is driven by the grading scale data,
 * so a rule correction is a config change, not a deploy (PRD section 8.4).
 */
export interface Band {
  minPercent: number;
  maxPercent: number;
  letter: string;
  point?: number;
  remark?: string;
}

export interface ScaleRules {
  failIfAnyCompulsoryFails: boolean;
  fourthSubjectBonus: boolean;
  graceMarksPerSubject: number;
  meritTieBreak: 'total_then_roll' | 'total_then_name';
}

export interface Scale {
  kind: 'gpa' | 'division' | 'percentage';
  bands: Band[];
  passPercent: number;
  rules: ScaleRules;
}

export interface ComponentDef {
  key: string;
  fullMarks: number;
  passMarks: number;
}

export interface SubjectInput {
  subjectId: string;
  name: string;
  kind: 'compulsory' | 'optional' | 'fourth';
  fullMarks: number;
  components: ComponentDef[];
  marks: { key: string; obtained: number | null; absent: boolean }[];
}

export interface SubjectGrade {
  subjectId: string;
  name: string;
  kind: string;
  total: number;
  fullMarks: number;
  percent: number;
  letter: string;
  point: number;
  passed: boolean;
  graceApplied: number;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const byMinDesc = (bands: Band[]) => [...bands].sort((a, b) => b.minPercent - a.minPercent);

/** Highest band whose minimum the percent reaches. Handles fractional percents between 79 and 80. */
export const bandFor = (percent: number, bands: Band[]): Band => {
  const sorted = byMinDesc(bands);
  return sorted.find((b) => percent >= b.minPercent) ?? sorted[sorted.length - 1];
};

const failBand = (bands: Band[]): Band => byMinDesc(bands)[bands.length - 1];

export const gradeSubject = (s: SubjectInput, scale: Scale): SubjectGrade => {
  let total = 0;
  let componentFailed = false;
  for (const def of s.components) {
    const m = s.marks.find((x) => x.key === def.key);
    const obtained = !m || m.absent || m.obtained === null ? 0 : m.obtained;
    total += obtained;
    // An absent component counts as 0 and fails when the component has its own pass mark.
    if (def.passMarks > 0 && (m?.absent || obtained < def.passMarks)) componentFailed = true;
  }
  const full = s.fullMarks;
  let percent = full > 0 ? (total / full) * 100 : 0;
  let graceApplied = 0;

  let passed = !componentFailed && percent >= scale.passPercent;

  // Grace marks help only a subject that fails on total marks alone, and only if they make it pass.
  const grace = scale.rules.graceMarksPerSubject;
  if (!passed && !componentFailed && grace > 0 && full > 0) {
    const needed = round2((scale.passPercent * full) / 100 - total);
    if (needed > 0 && needed <= grace) {
      graceApplied = needed;
      total = round2(total + needed);
      percent = (total / full) * 100;
      passed = true;
    }
  }

  const band = passed ? bandFor(percent, scale.bands) : failBand(scale.bands);
  return {
    subjectId: s.subjectId,
    name: s.name,
    kind: s.kind,
    total: round2(total),
    fullMarks: full,
    percent: round2(percent),
    letter: band.letter,
    point: passed ? (band.point ?? 0) : (failBand(scale.bands).point ?? 0),
    passed,
    graceApplied,
  };
};

export interface StudentGrade {
  subjects: SubjectGrade[];
  totalMarks: number;
  fullMarks: number;
  percent: number;
  gpa?: number;
  letter: string;
  division?: string;
  passed: boolean;
  failedSubjectIds: string[];
}

export const gradeStudent = (subjects: SubjectInput[], scale: Scale): StudentGrade => {
  const graded = subjects.map((s) => gradeSubject(s, scale));
  const counted = graded.filter((g) => g.kind !== 'fourth');
  const fourth = graded.find((g) => g.kind === 'fourth');

  // The fourth subject never fails the student; every other subject can.
  const failedCounted = counted.filter((g) => !g.passed);
  const passed = scale.rules.failIfAnyCompulsoryFails ? failedCounted.length === 0 : true;
  const failedSubjectIds = graded.filter((g) => !g.passed).map((g) => g.subjectId);

  const totalMarks = round2(graded.reduce((a, g) => a + g.total, 0));
  const fullMarks = graded.reduce((a, g) => a + g.fullMarks, 0);
  const percent = fullMarks > 0 ? round2((totalMarks / fullMarks) * 100) : 0;
  const lowest = failBand(scale.bands);

  if (scale.kind === 'gpa') {
    let gpa = 0;
    if (passed && counted.length > 0) {
      const base = counted.reduce((a, g) => a + g.point, 0);
      // Points above 2.00 on the fourth subject are added to the sum; the divisor stays the same.
      const bonus =
        scale.rules.fourthSubjectBonus && fourth && fourth.passed ? Math.max(0, fourth.point - 2) : 0;
      gpa = Math.min(5, round2((base + bonus) / counted.length));
    }
    const withPoints = scale.bands
      .filter((b) => b.point !== undefined)
      .sort((a, b) => (b.point ?? 0) - (a.point ?? 0));
    const overall = passed ? (withPoints.find((b) => (b.point ?? 0) <= gpa) ?? lowest) : lowest;
    return {
      subjects: graded,
      totalMarks,
      fullMarks,
      percent,
      gpa,
      letter: overall.letter,
      passed,
      failedSubjectIds,
    };
  }

  const band = passed ? bandFor(percent, scale.bands) : lowest;
  return {
    subjects: graded,
    totalMarks,
    fullMarks,
    percent,
    letter: band.letter,
    division: scale.kind === 'division' ? band.letter : undefined,
    passed,
    failedSubjectIds,
  };
};

export interface RankInput {
  id: string;
  roll: number;
  name: string;
  passed: boolean;
  gpa?: number;
  percent: number;
  totalMarks: number;
}

/**
 * Merit order: passed first, then GPA (or percent when the scale has no GPA), then total marks.
 * Students equal on all of those share a position (1, 1, 3). The tie-break only fixes list order.
 */
export const rank = (
  students: RankInput[],
  tieBreak: ScaleRules['meritTieBreak'],
): { id: string; position: number }[] => {
  const key = (s: RankInput) => [s.passed ? 1 : 0, s.gpa ?? s.percent, s.totalMarks];
  const cmp = (a: RankInput, b: RankInput) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return tieBreak === 'total_then_name' ? a.name.localeCompare(b.name) : a.roll - b.roll;
  };
  const sorted = [...students].sort(cmp);
  const out: { id: string; position: number }[] = [];
  sorted.forEach((s, i) => {
    const prev = sorted[i - 1];
    const same = prev && key(prev).every((v, idx) => v === key(s)[idx]);
    out.push({ id: s.id, position: same ? out[i - 1].position : i + 1 });
  });
  return out;
};
