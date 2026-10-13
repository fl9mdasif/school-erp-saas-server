import type { FeeCycle, InstitutionType, Terminology } from './tenant.interface';

interface Preset {
  terminology: Terminology;
  defaultFeeCycle: FeeCycle;
  publicTemplate: 'classic' | 'modern';
  gradingPreset: 'gpa5' | 'division' | 'percentage';
  feeHeads: { code: string; name: string; nameBn: string; kind: 'recurring' | 'one_time' }[];
}

const common = {
  roll: { en: 'Roll', bn: 'রোল' },
  student: { en: 'Student', bn: 'শিক্ষার্থী' },
  teacher: { en: 'Teacher', bn: 'শিক্ষক' },
};

export const PRESETS: Record<InstitutionType, Preset> = {
  school: {
    terminology: { class: { en: 'Class', bn: 'শ্রেণি' }, section: { en: 'Section', bn: 'শাখা' }, ...common },
    defaultFeeCycle: 'monthly',
    publicTemplate: 'classic',
    gradingPreset: 'gpa5',
    feeHeads: [
      { code: 'TUITION', name: 'Tuition', nameBn: 'টিউশন ফি', kind: 'recurring' },
      { code: 'EXAM', name: 'Exam', nameBn: 'পরীক্ষা ফি', kind: 'one_time' },
      { code: 'ADMISSION', name: 'Admission', nameBn: 'ভর্তি ফি', kind: 'one_time' },
      { code: 'SESSION', name: 'Session', nameBn: 'সেশন ফি', kind: 'one_time' },
    ],
  },
  madrasa: {
    terminology: {
      class: { en: 'Class', bn: 'শ্রেণি / জামাত' },
      section: { en: 'Section', bn: 'শাখা' },
      teacher: { en: 'Ustad', bn: 'উস্তাদ' },
      roll: common.roll,
      student: common.student,
    },
    defaultFeeCycle: 'monthly',
    publicTemplate: 'classic',
    gradingPreset: 'division',
    feeHeads: [
      { code: 'TUITION', name: 'Tuition', nameBn: 'টিউশন ফি', kind: 'recurring' },
      { code: 'EXAM', name: 'Exam', nameBn: 'পরীক্ষা ফি', kind: 'one_time' },
      { code: 'ADMISSION', name: 'Admission', nameBn: 'ভর্তি ফি', kind: 'one_time' },
    ],
  },
  coaching: {
    terminology: { class: { en: 'Batch', bn: 'ব্যাচ' }, section: { en: 'Group', bn: 'গ্রুপ' }, ...common },
    defaultFeeCycle: 'monthly',
    publicTemplate: 'modern',
    gradingPreset: 'percentage',
    feeHeads: [
      { code: 'COURSE', name: 'Course fee', nameBn: 'কোর্স ফি', kind: 'recurring' },
      { code: 'ADMISSION', name: 'Admission', nameBn: 'ভর্তি ফি', kind: 'one_time' },
      { code: 'MATERIAL', name: 'Study material', nameBn: 'স্টাডি ম্যাটেরিয়াল', kind: 'one_time' },
    ],
  },
};
