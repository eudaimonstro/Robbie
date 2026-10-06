import { describe, it, expect } from 'vitest';
import { databaseSsl } from '../db/databaseSsl.js';

describe('databaseSsl', () => {
  it('leaves an sslmode in the URL to the driver', () => {
    expect(databaseSsl('postgresql://u:p@db.example.com/robbie?sslmode=disable')).toBeUndefined();
  });

  it('follows DATABASE_SSL when set', () => {
    const url = 'postgresql://u:p@postgres:5432/robbie';
    expect(databaseSsl(url, 'disable')).toBe(false);
    expect(databaseSsl(url, 'require')).toEqual({ rejectUnauthorized: false });
    expect(databaseSsl(url, 'verify')).toEqual({ rejectUnauthorized: true });
  });

  it('connects to a database on this machine without TLS', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(databaseSsl(`postgresql://u:p@${host}:5432/robbie`)).toBe(false);
    }
  });

  it('uses TLS for other hosts by default, as before', () => {
    expect(databaseSsl('postgresql://u:p@db.example.com:5432/robbie')).toEqual({
      rejectUnauthorized: false,
    });
  });
});
