// Validation patterns
const MEETING_CODE_PATTERN = /^[A-Z0-9]{4,8}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateMeetingCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return 'Meeting code is required';
  if (!MEETING_CODE_PATTERN.test(trimmed)) return 'Meeting code must be 4-8 alphanumeric characters';
  return null;
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return 'Email is required';
  if (!EMAIL_PATTERN.test(trimmed)) return 'Please enter a valid email address';
  return null;
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required';
  if (trimmed.length < 2) return 'Name must be at least 2 characters';
  if (trimmed.length > 100) return 'Name must be 100 characters or less';
  return null;
}

export function validateVerificationCode(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return 'Verification code is required';
  if (!/^\d{6}$/.test(trimmed)) return 'Verification code must be 6 digits';
  return null;
}
