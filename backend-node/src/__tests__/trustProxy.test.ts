import { describe, it, expect } from 'vitest';
import { trustProxyHops } from '../middleware/trustProxy.js';

describe('trustProxyHops', () => {
  it('trusts no proxy unless told how many hops there are', () => {
    expect(trustProxyHops(undefined)).toBe(0);
    expect(trustProxyHops('')).toBe(0);
    expect(trustProxyHops(' 0 ')).toBe(0);
  });

  it('reads the number of proxy hops', () => {
    expect(trustProxyHops('1')).toBe(1);
    expect(trustProxyHops('2')).toBe(2);
  });

  it('refuses anything but a whole number of hops', () => {
    for (const value of ['true', 'yes', '-1', '1.5', 'loopback', '10.0.0.1']) {
      expect(() => trustProxyHops(value)).toThrow(/TRUST_PROXY/);
    }
  });
});
