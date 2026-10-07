import { describe, it, expect } from 'vitest';
import { browserTimeZone, timeZoneNames } from '../timeZones';

describe('time zones', () => {
  it("reads the browser's time zone", () => {
    // vitest.config.ts runs the suite in Chicago
    expect(browserTimeZone()).toBe('America/Chicago');
  });

  it('lists the zones the browser knows, always with the one in use', () => {
    const names = timeZoneNames('America/Chicago');
    expect(names).toContain('Europe/Paris');
    expect(names.filter((name) => name === 'America/Chicago')).toHaveLength(1);
    expect(timeZoneNames('Etc/Unknown')[0]).toBe('Etc/Unknown');
  });
});
