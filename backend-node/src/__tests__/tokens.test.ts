import { describe, it, expect } from 'vitest';
import { hashSecret, newSessionToken, newSignInCode } from '../auth/tokens.js';

describe('tokens', () => {
  it('makes long, unique session tokens', () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    expect(a).not.toBe(b);
  });

  it('makes 6-digit sign-in codes, keeping leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(newSignInCode()).toMatch(/^\d{6}$/);
  });

  it('hashes with SHA-256 so only hashes are stored', () => {
    expect(hashSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
