// Validation patterns
const MEETING_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;

export function validateMeetingCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return 'Meeting code is required';
  if (!MEETING_CODE_PATTERN.test(trimmed))
    return 'Meeting code must be 4-8 alphanumeric characters';
  return null;
}
