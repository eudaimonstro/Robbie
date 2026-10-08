import { randomInt } from 'node:crypto';

/** Letters and digits that can't be mistaken for one another (no 0, O, 1, I or L) */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** A generated code's length: 31^6, about 890 million codes, too many to guess */
export const GENERATED_CODE_LENGTH = 6;

/** A random meeting code for a new scheduled meeting (the live meeting code format) */
export function randomMeetingCode(): string {
  let code = '';
  for (let i = 0; i < GENERATED_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}
