/** Bangladesh mobile numbers are stored as 01XXXXXXXXX. */
export const normalizeBdPhone = (input: string): string | null => {
  const digits = input.replace(/[\s\-()]/g, '');
  const m = digits.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return m ? m[1] : null;
};
