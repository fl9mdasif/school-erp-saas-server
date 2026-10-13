import { randomInt } from 'node:crypto';

// No look-alike characters (0/O, 1/l/I) so it can be read out over the phone.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateTempPassword = (length = 10): string =>
  Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
