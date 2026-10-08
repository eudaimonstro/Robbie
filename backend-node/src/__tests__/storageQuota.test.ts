import { describe, it, expect } from 'vitest';
import {
  isValidOrgStorageLimit,
  orgStorageLimitMb,
  storageFullMessage,
} from '../bylawyer/services/storageQuota.js';

describe('organization storage limit', () => {
  it('is 500 MB unless ORG_STORAGE_LIMIT_MB gives a positive whole number', () => {
    expect(orgStorageLimitMb({})).toBe(500);
    expect(orgStorageLimitMb({ ORG_STORAGE_LIMIT_MB: ' 250 ' })).toBe(250);
    for (const bad of ['', '0', '-5', '1.5', 'lots', '1e3']) {
      expect(orgStorageLimitMb({ ORG_STORAGE_LIMIT_MB: bad })).toBe(500);
    }
  });

  it('tells which values are valid', () => {
    expect(isValidOrgStorageLimit(undefined)).toBe(true);
    expect(isValidOrgStorageLimit('')).toBe(true);
    expect(isValidOrgStorageLimit('1000')).toBe(true);
    expect(isValidOrgStorageLimit('0')).toBe(false);
    expect(isValidOrgStorageLimit('500MB')).toBe(false);
  });

  it('says how much the organization has and what to do', () => {
    expect(storageFullMessage(500)).toBe(
      'This organization has used its 500 MB of storage for files. Remove some files to add more.',
    );
  });
});
