import { describe, expect, it } from 'vitest';
import {
  GPA5_BANDS,
  DIVISION_BANDS,
  PERCENTAGE_BANDS,
} from '../src/app/modules/gradingScale/gradingScale.presets';
import {
  gradeStudent,
  gradeSubject,
  rank,
  type Scale,
  type SubjectInput,
} from '../src/app/modules/result/result.engine';

const scale = (over: Partial<Scale['rules']> = {}, passPercent = 33): Scale => ({
  kind: 'gpa',
  bands: GPA5_BANDS,
  passPercent,
  rules: {
    failIfAnyCompulsoryFails: true,
    fourthSubjectBonus: true,
    graceMarksPerSubject: 0,
    meritTieBreak: 'total_then_roll',
    ...over,
  },
});

const simple = (id: string, obtained: number, kind: SubjectInput['kind'] = 'compulsory'): SubjectInput => ({
  subjectId: id,
  name: id,
  kind,
  fullMarks: 100,
  components: [{ key: 'total', fullMarks: 100, passMarks: 0 }],
  marks: [{ key: 'total', obtained, absent: false }],
});

describe('subject grading (hand checked)', () => {
  it('maps percent to the GPA 5.00 table', () => {
    const cases: [number, string, number][] = [
      [100, 'A+', 5],
      [80, 'A+', 5],
      [79, 'A', 4],
      [70, 'A', 4],
      [69, 'A-', 3.5],
      [60, 'A-', 3.5],
      [59, 'B', 3],
      [50, 'B', 3],
      [49, 'C', 2],
      [40, 'C', 2],
      [39, 'D', 1],
      [33, 'D', 1],
      [32, 'F', 0],
      [0, 'F', 0],
    ];
    for (const [marks, letter, point] of cases) {
      const g = gradeSubject(simple('x', marks), scale());
      expect([marks, g.letter, g.point]).toEqual([marks, letter, point]);
    }
  });
  it('treats fractional marks between bands correctly (79.5 is still A)', () => {
    expect(gradeSubject(simple('x', 79.5), scale()).letter).toBe('A');
  });
  it('fails a subject when a component with its own pass mark is short, even if the total passes', () => {
    const s: SubjectInput = {
      subjectId: 'b',
      name: 'Bangla',
      kind: 'compulsory',
      fullMarks: 100,
      components: [
        { key: 'written', fullMarks: 70, passMarks: 23 },
        { key: 'mcq', fullMarks: 30, passMarks: 10 },
      ],
      marks: [
        { key: 'written', obtained: 60, absent: false },
        { key: 'mcq', obtained: 5, absent: false },
      ],
    };
    const g = gradeSubject(s, scale());
    expect(g.total).toBe(65);
    expect(g.passed).toBe(false);
    expect(g.letter).toBe('F');
    expect(g.point).toBe(0);
  });
  it('an absent component counts as zero and fails when it has pass marks', () => {
    const s: SubjectInput = {
      subjectId: 'b',
      name: 'Bangla',
      kind: 'compulsory',
      fullMarks: 100,
      components: [
        { key: 'written', fullMarks: 70, passMarks: 23 },
        { key: 'mcq', fullMarks: 30, passMarks: 10 },
      ],
      marks: [
        { key: 'written', obtained: 70, absent: false },
        { key: 'mcq', obtained: null, absent: true },
      ],
    };
    const g = gradeSubject(s, scale());
    expect(g.total).toBe(70);
    expect(g.passed).toBe(false);
    // an absent component with no pass mark simply adds zero
    const s2: SubjectInput = {
      ...s,
      components: [
        { key: 'written', fullMarks: 70, passMarks: 0 },
        { key: 'mcq', fullMarks: 30, passMarks: 0 },
      ],
    };
    expect(gradeSubject(s2, scale()).passed).toBe(true);
  });
  it('grace marks only help when they are enough and the total is the only problem', () => {
    expect(gradeSubject(simple('x', 31), scale({ graceMarksPerSubject: 3 }))).toMatchObject({
      passed: true,
      total: 33,
      graceApplied: 2,
      letter: 'D',
    });
    expect(gradeSubject(simple('x', 31), scale({ graceMarksPerSubject: 1 })).passed).toBe(false);
    expect(gradeSubject(simple('x', 31), scale({ graceMarksPerSubject: 0 })).passed).toBe(false);
    const comp: SubjectInput = {
      subjectId: 'c',
      name: 'c',
      kind: 'compulsory',
      fullMarks: 100,
      components: [
        { key: 'a', fullMarks: 70, passMarks: 23 },
        { key: 'b', fullMarks: 30, passMarks: 10 },
      ],
      marks: [
        { key: 'a', obtained: 60, absent: false },
        { key: 'b', obtained: 5, absent: false },
      ],
    };
    expect(gradeSubject(comp, scale({ graceMarksPerSubject: 10 })).passed).toBe(false); // component failure is not cured by grace
  });
});

describe('student GPA (hand checked)', () => {
  it('averages points of the counted subjects and rounds half up to two decimals', () => {
    const subs = [85, 72, 65, 55, 45, 35].map((m, i) => simple(`s${i}`, m)); // 5+4+3.5+3+2+1 = 18.5 / 6
    const g = gradeStudent(subs, scale());
    expect(g.gpa).toBe(3.08);
    expect(g.passed).toBe(true);
    expect(g.totalMarks).toBe(357);
    expect(gradeStudent([simple('a', 85), simple('b', 72), simple('c', 65)], scale()).gpa).toBe(4.17); // 12.5 / 3 = 4.1666
  });
  it('a failed compulsory subject fails the student with GPA 0.00 and letter F', () => {
    const g = gradeStudent([simple('a', 90), simple('b', 90), simple('c', 30)], scale());
    expect(g).toMatchObject({ passed: false, gpa: 0, letter: 'F' });
    expect(g.failedSubjectIds).toEqual(['c']);
  });
  it('the fail rule is configurable', () => {
    const g = gradeStudent([simple('a', 90), simple('c', 30)], scale({ failIfAnyCompulsoryFails: false }));
    expect(g.passed).toBe(true);
    expect(g.gpa).toBe(2.5); // (5 + 0) / 2
  });
  it('fourth subject adds only points above 2.00 and the divisor stays the same', () => {
    const base = [1, 2, 3, 4, 5].map((i) => simple(`c${i}`, 75)); // five A = 4.00 each = 20
    expect(gradeStudent([...base, simple('f', 85, 'fourth')], scale()).gpa).toBe(4.6); // (20 + 3) / 5
    expect(gradeStudent([...base, simple('f', 45, 'fourth')], scale()).gpa).toBe(4); // point 2.00 adds nothing
    expect(gradeStudent([...base, simple('f', 85, 'fourth')], scale({ fourthSubjectBonus: false })).gpa).toBe(
      4,
    );
  });
  it('a failed fourth subject never fails the student and adds no bonus', () => {
    const base = [1, 2, 3, 4, 5].map((i) => simple(`c${i}`, 75));
    const g = gradeStudent([...base, simple('f', 10, 'fourth')], scale());
    expect(g.passed).toBe(true);
    expect(g.gpa).toBe(4);
    expect(g.failedSubjectIds).toEqual(['f']);
  });
  it('caps GPA at 5.00', () => {
    const base = [1, 2, 3].map((i) => simple(`c${i}`, 95));
    expect(gradeStudent([...base, simple('f', 95, 'fourth')], scale()).gpa).toBe(5);
  });
  it('overall letter follows GPA', () => {
    expect(gradeStudent([simple('a', 95)], scale()).letter).toBe('A+');
    expect(gradeStudent([simple('a', 75)], scale()).letter).toBe('A');
    expect(gradeStudent([simple('a', 55)], scale()).letter).toBe('B');
  });
});

describe('other scales use the same pipeline', () => {
  it('percentage scale ranks on overall percent', () => {
    const s: Scale = { kind: 'percentage', bands: PERCENTAGE_BANDS, passPercent: 33, rules: scale().rules };
    const g = gradeStudent([simple('a', 80), simple('b', 60)], s);
    expect(g).toMatchObject({ percent: 70, letter: 'A', passed: true });
    expect(g.gpa).toBeUndefined();
  });
  it('division scale reports a division and Rasib on fail', () => {
    const s: Scale = { kind: 'division', bands: DIVISION_BANDS, passPercent: 33, rules: scale().rules };
    expect(gradeStudent([simple('a', 85), simple('b', 85)], s).division).toBe('Mumtaz');
    expect(gradeStudent([simple('a', 85), simple('b', 10)], s).division).toBe('Rasib');
  });
});

describe('merit ranking', () => {
  const st = (id: string, roll: number, gpa: number, total: number, passed = true, name = id) => ({
    id,
    roll,
    name,
    passed,
    gpa,
    percent: 0,
    totalMarks: total,
  });
  it('ranks passed first, then GPA, then total; ties share a position (1, 1, 3)', () => {
    const out = rank(
      [st('c', 3, 5, 490), st('a', 1, 5, 500), st('b', 2, 5, 500), st('f', 4, 0, 900, false)],
      'total_then_roll',
    );
    expect(out).toEqual([
      { id: 'a', position: 1 },
      { id: 'b', position: 1 },
      { id: 'c', position: 3 },
      { id: 'f', position: 4 },
    ]);
  });
  it('the tie-break only changes list order, not the shared position', () => {
    const byRoll = rank(
      [st('z', 1, 4, 400, true, 'Zed'), st('a', 2, 4, 400, true, 'Abe')],
      'total_then_roll',
    );
    const byName = rank(
      [st('z', 1, 4, 400, true, 'Zed'), st('a', 2, 4, 400, true, 'Abe')],
      'total_then_name',
    );
    expect(byRoll.map((r) => r.id)).toEqual(['z', 'a']);
    expect(byName.map((r) => r.id)).toEqual(['a', 'z']);
    expect(byRoll.every((r) => r.position === 1)).toBe(true);
  });
  it('uses percent when the scale has no GPA', () => {
    const mk = (id: string, percent: number) => ({
      id,
      roll: 1,
      name: id,
      passed: true,
      percent,
      totalMarks: percent,
    });
    expect(rank([mk('x', 60), mk('y', 80)], 'total_then_roll')[0].id).toBe('y');
  });
});
