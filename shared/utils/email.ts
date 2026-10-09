/**
 * An email address as the server takes one: zod's email pattern (zod 4, `z.email()`), so a list
 * checked on the web is checked the same way on the server (backend-node's emailAddress test
 * holds the two together)
 */
const EMAIL_ADDRESS =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** Whether the text is an email address the server accepts (at most 254 characters) */
export function isEmailAddress(text: string): boolean {
  return text.length <= 254 && EMAIL_ADDRESS.test(text);
}
